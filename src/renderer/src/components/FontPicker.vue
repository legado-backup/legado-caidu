<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  nextTick,
} from "vue";
import { icons } from "../icons";
import IconButton from "./IconButton.vue";
import LoadingDotsBounce from "./LoadingDotsBounce.vue";
import VirtualList from "./VirtualList.vue";
import { cssFontFamilyStack } from "../utils/fontFamilyCss";
import { ensureSystemFontCatalog } from "../utils/systemFontCatalog";
import {
  PRESET_FONT_KEYS,
  detectFontPickerSelection,
  getPresetCssStack,
  getPresetFontStack,
  getPresetLabel,
  type PresetFontKey,
} from "../utils/presetFontDefinitions";
import {
  STEALTH_SYSTEM_UI_FONT,
  STEALTH_TERMINAL_FONT_MARKER,
  isStealthSystemUiFont,
  isStealthTerminalFont,
} from "../utils/stealthReaderSettings";
import { useAnchoredAppShellMenu } from "../composables/useAnchoredAppShellMenu";
import type { AnchoredMenuPlacement } from "../utils/appShellMenuPosition";

const props = withDefaults(
  defineProps<{
    monacoFontFamily: string;
    /** 已钉在外层列表的「其他字体」名称 */
    pinnedOtherFonts?: string[];
    disabled?: boolean;
    /** 菜单层叠（Teleport 到 body；需高于外层模态时传入更大值） */
    menuZIndex?: number;
    /** 摸鱼设置：菜单顶部增加「系统默认」「终端默认」 */
    showStealthDefaults?: boolean;
    /** 相对触发器的弹出对齐；窄窗宜用 below-end 以免右侧被裁切 */
    menuPlacement?: AnchoredMenuPlacement;
  }>(),
  {
    pinnedOtherFonts: () => [],
    disabled: false,
    menuZIndex: 7200,
    showStealthDefaults: false,
    menuPlacement: "below-center",
  },
);

const emit = defineEmits<{
  setMonacoFont: [fontFamily: string];
  togglePinOtherFont: [fontName: string];
}>();

const fontMenuOpen = ref(false);
const showOtherFontsPanel = ref(false);
const systemFonts = ref<string[]>([]);
const systemFontsLoading = ref(false);

const fontPickerAnchorEl = ref<HTMLElement | null>(null);
const otherFontFilterInputRef = ref<HTMLInputElement | null>(null);
const fontOtherVirtualListRef = ref<InstanceType<typeof VirtualList> | null>(
  null,
);

/** 系统字体列表过滤关键字 */
const otherFontFilter = ref("");

const filteredSystemFonts = computed(() => {
  const list = systemFonts.value;
  const q = otherFontFilter.value.trim().toLowerCase();
  if (!q) return list;
  return list.filter((f) => f.toLowerCase().includes(q));
});

/** 虚拟列表单行高度（px），与 `.fontOtherItem` 一致 */
const FONT_ROW_STRIDE = 40;
const VIRTUAL_OVERSCAN = 10;

const selectedFont = computed(() =>
  detectFontPickerSelection(props.monacoFontFamily),
);

const stealthSystemSelected = computed(
  () =>
    props.showStealthDefaults && isStealthSystemUiFont(props.monacoFontFamily),
);
const stealthTerminalSelected = computed(
  () =>
    props.showStealthDefaults && isStealthTerminalFont(props.monacoFontFamily),
);

const presetFontMenuItems = computed(() =>
  PRESET_FONT_KEYS.map((key) => ({
    key,
    label: getPresetLabel(key),
    stack: getPresetFontStack(key),
  })),
);

const fontPickerButtonTitle = computed(() => {
  if (stealthSystemSelected.value) return "字体：系统默认";
  if (stealthTerminalSelected.value) return "字体：终端默认";
  return selectedFont.value.key === "other"
    ? `字体：${selectedFont.value.otherName ?? ""}`
    : `字体：${getPresetLabel(selectedFont.value.key)}`;
});

const selectedOtherFontNormalized = computed(() => {
  // 摸鱼「系统默认 / 终端默认」哨兵不是可选「其他字体」，勿出现在外层列表
  if (stealthSystemSelected.value || stealthTerminalSelected.value) return null;
  if (selectedFont.value.key !== "other") return null;
  const name = (selectedFont.value.otherName ?? "").trim();
  if (!name) return null;
  if (props.showStealthDefaults && isStealthMarkerFontName(name)) return null;
  return name;
});

function normalizeOtherFontName(name: string): string {
  return name.trim();
}

/** CSS 泛型 / 摸鱼哨兵，不应当成可钉的「其他字体」名称 */
function isStealthMarkerFontName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return (
    n === "system-ui" ||
    n === "ui-monospace" ||
    n === STEALTH_SYSTEM_UI_FONT.toLowerCase() ||
    n === STEALTH_TERMINAL_FONT_MARKER.toLowerCase()
  );
}

const outerOtherFontItems = computed(() => {
  const seen = new Set<string>();
  const items: { name: string; pinned: boolean }[] = [];
  for (const raw of props.pinnedOtherFonts) {
    const name = normalizeOtherFontName(raw);
    if (!name || seen.has(name)) continue;
    if (props.showStealthDefaults && isStealthMarkerFontName(name)) continue;
    seen.add(name);
    items.push({ name, pinned: true });
  }
  const selected = selectedOtherFontNormalized.value;
  if (selected && !seen.has(selected)) {
    items.push({ name: selected, pinned: false });
  }
  return items;
});

function setFontAndClose(fontFamily: string) {
  // 切换字体后保持面板打开，便于连续预览与比较
  emit("setMonacoFont", fontFamily);
}

async function ensureSystemFontsLoaded() {
  if (systemFonts.value.length > 0 || systemFontsLoading.value) return;
  systemFontsLoading.value = true;
  try {
    systemFonts.value = await ensureSystemFontCatalog();
  } catch {
    systemFonts.value = [];
  } finally {
    systemFontsLoading.value = false;
  }
}

function closeFontMenu() {
  fontMenu.closeMenu();
}

function waitDoubleRaf(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** 切换预设 / 系统字体面板时先藏起，等宽度与滚动落稳再显示，避免错位与列表重影闪一帧 */
const fontMenuLayoutSettled = ref(true);

const fontMenu = useAnchoredAppShellMenu({
  open: fontMenuOpen,
  anchor: fontPickerAnchorEl,
  placement: () => props.menuPlacement,
  /** 仅作定位估算；勿写死 CSS width，外层列表需按最长字体名撑开 */
  widthPx: () => (showOtherFontsPanel.value ? 280 : 140),
  applyWidthPx: false,
  gap: 6,
  zIndex: props.menuZIndex,
  autoFlip: true,
  onClose: () => {
    showOtherFontsPanel.value = false;
    otherFontFilter.value = "";
    fontMenuLayoutSettled.value = true;
  },
});

const {
  panelRef: fontMenuPanelRef,
  panelStyle: fontMenuPanelStyle,
  resolvedPlacement: fontMenuPlacement,
  left: fontMenuLeft,
} = fontMenu;

const fontMenuOpensAbove = computed(() =>
  fontMenuPlacement.value.startsWith("above"),
);

/** 视口夹取后面板左移后，小三角仍对准触发器中心 */
const fontMenuArrowX = computed(() => {
  if (!fontMenuOpen.value) return "50%";
  const anchor = fontPickerAnchorEl.value;
  if (!anchor) return "50%";
  const rect = anchor.getBoundingClientRect();
  const mid = rect.left + rect.width / 2;
  const panelW = fontMenuPanelRef.value?.offsetWidth ?? 140;
  const x = mid - fontMenuLeft.value;
  return `${Math.max(10, Math.min(panelW - 10, x))}px`;
});

function toggleFontMenu() {
  if (props.disabled) return;
  void fontMenu.toggleMenu();
}

function choosePreset(key: PresetFontKey) {
  setFontAndClose(getPresetCssStack(key));
}

function chooseStealthSystemUi() {
  setFontAndClose(STEALTH_SYSTEM_UI_FONT);
}

function chooseStealthTerminal() {
  setFontAndClose(STEALTH_TERMINAL_FONT_MARKER);
}

async function openOtherFonts() {
  fontMenuLayoutSettled.value = false;
  showOtherFontsPanel.value = true;
  otherFontFilter.value = "";
  // 先按新宽度重算位置（隐藏期间完成），再显示加载态，避免宽面板错位闪一帧
  await nextTick();
  await waitDoubleRaf();
  await fontMenu.reposition();
  await waitDoubleRaf();
  fontMenuLayoutSettled.value = true;
  await ensureSystemFontsLoaded();
  await nextTick();
  await scrollSelectedOtherFontIntoView();
  otherFontFilterInputRef.value?.focus({ preventScroll: true });
}

async function backFromOtherFonts() {
  fontMenuLayoutSettled.value = false;
  showOtherFontsPanel.value = false;
  otherFontFilter.value = "";
  await nextTick();
  await waitDoubleRaf();
  await fontMenu.reposition();
  await waitDoubleRaf();
  fontMenuLayoutSettled.value = true;
}

function chooseOtherFont(fontName: string) {
  setFontAndClose(cssFontFamilyStack([fontName]));
}

function onOtherFontRowClick(fontName: string) {
  if (isOtherFontSelected(fontName)) {
    void openOtherFonts();
    return;
  }
  chooseOtherFont(fontName);
}

function onPinOtherFontClick(fontName: string, ev: MouseEvent) {
  ev.preventDefault();
  ev.stopPropagation();
  emit("togglePinOtherFont", fontName);
}

function isOtherFontSelected(fontName: string) {
  if (selectedFont.value.key !== "other") return false;
  return normalizeOtherFontName(fontName) === selectedOtherFontNormalized.value;
}

async function scrollSelectedOtherFontIntoView() {
  const selected = selectedOtherFontNormalized.value;
  if (!selected) return;
  const list = filteredSystemFonts.value;
  const idx = list.findIndex((f) => f.trim() === selected.trim());
  if (idx < 0) return;
  await fontOtherVirtualListRef.value?.scrollToIndex(idx, { align: "center" });
}

watch(otherFontFilter, () => {
  if (!showOtherFontsPanel.value || systemFontsLoading.value) return;
  if (!fontMenuLayoutSettled.value) return;
  void nextTick().then(async () => {
    fontOtherVirtualListRef.value?.scrollToTop();
    await scrollSelectedOtherFontIntoView();
  });
});

watch(
  () => props.disabled,
  (locked) => {
    if (locked) closeFontMenu();
  },
);
</script>

<template>
  <div ref="fontPickerAnchorEl" class="fontPicker">
    <IconButton
      :icon-html="icons.fontFamily"
      :active="fontMenuOpen"
      :pressed="fontMenuOpen"
      :title="fontPickerButtonTitle"
      aria-label="选择字体"
      :disabled="disabled"
      @click.stop="toggleFontMenu"
    />

    <Teleport to="body">
      <div
        v-if="fontMenuOpen"
        ref="fontMenuPanelRef"
        class="fontMenu fontMenu--teleport"
        :class="{
          'fontMenu--other': showOtherFontsPanel,
          'fontMenu--above': fontMenuOpensAbove,
          'fontMenu--layoutPending': !fontMenuLayoutSettled,
        }"
        data-header-float-panel
        data-fullscreen-header-float
        :style="{
          position: 'fixed',
          left: fontMenuPanelStyle.left,
          top: fontMenuPanelStyle.top,
          width: fontMenuPanelStyle.width,
          zIndex: fontMenuPanelStyle.zIndex,
          '--font-menu-max-height': fontMenuPanelStyle.maxHeight,
          '--font-menu-arrow-x': fontMenuArrowX,
        }"
        @click.stop
      >
      <div v-if="!showOtherFontsPanel" class="fontMenuList">
        <div class="fontMenuListBody">
          <template v-if="showStealthDefaults">
            <button
              type="button"
              class="fontMenuItem"
              :class="{ active: stealthSystemSelected }"
              @click="chooseStealthSystemUi"
            >
              系统默认
            </button>
            <button
              type="button"
              class="fontMenuItem"
              :class="{ active: stealthTerminalSelected }"
              style="font-family: ui-monospace, monospace"
              @click="chooseStealthTerminal"
            >
              终端默认
            </button>
            <div class="fontMenuDivider fontMenuDivider--inList"></div>
          </template>
          <button
            v-for="item in presetFontMenuItems"
            :key="item.key"
            class="fontMenuItem"
            :class="{
              active:
                !stealthSystemSelected &&
                !stealthTerminalSelected &&
                selectedFont.key === item.key,
            }"
            :style="{ fontFamily: cssFontFamilyStack(item.stack) }"
            @click="choosePreset(item.key)"
          >
            {{ item.label }}
          </button>

          <div
            v-for="item in outerOtherFontItems"
            :key="item.name"
            class="fontMenuItemRow"
            :class="{
              active:
                !stealthSystemSelected &&
                !stealthTerminalSelected &&
                isOtherFontSelected(item.name),
            }"
          >
            <button
              type="button"
              class="fontMenuItem fontMenuItem--other"
              :style="{ fontFamily: cssFontFamilyStack([item.name]) }"
              @click="onOtherFontRowClick(item.name)"
            >
              {{ item.name }}
            </button>
            <button
              type="button"
              class="fontMenuPinBtn"
              :class="{ 'fontMenuPinBtn--active': item.pinned }"
              :title="item.pinned ? '取消固定' : '固定到列表'"
              :aria-label="item.pinned ? '取消固定' : '固定到列表'"
              :aria-pressed="item.pinned"
              @click="onPinOtherFontClick(item.name, $event)"
            >
              <span
                class="fontMenuPinIcon"
                v-html="item.pinned ? icons.pinActive : icons.pin"
              ></span>
            </button>
          </div>
        </div>

        <div class="fontMenuListFooter">
          <div class="fontMenuDivider"></div>

          <button class="fontMenuItem" @click="openOtherFonts">系统字体</button>
        </div>
      </div>

      <div v-else class="fontOtherPanel">
        <div class="fontOtherHeader">
          <div class="fontOtherTitle">选择系统字体</div>
          <button class="btn" @click="backFromOtherFonts">返回</button>
        </div>

        <div v-if="systemFontsLoading" class="fontOtherLoading">
          加载中<LoadingDotsBounce />
        </div>

        <template v-else>
          <div class="fontOtherFilterRow">
            <input
              ref="otherFontFilterInputRef"
              v-model="otherFontFilter"
              type="search"
              class="fontOtherFilterInput"
              placeholder="过滤字体名称…"
              autocomplete="off"
              spellcheck="false"
              @click.stop
            />
          </div>

          <div v-if="systemFonts.length === 0" class="fontOtherEmpty">
            未获取到字体列表
          </div>
          <div
            v-else-if="filteredSystemFonts.length === 0"
            class="fontOtherEmpty"
          >
            无匹配的字体
          </div>
          <VirtualList
            v-else
            ref="fontOtherVirtualListRef"
            class="fontOtherList"
            :item-count="filteredSystemFonts.length"
            :row-stride="FONT_ROW_STRIDE"
            :overscan="VIRTUAL_OVERSCAN"
            :scroll-padding="10"
            :item-key="(i) => filteredSystemFonts[i] ?? i"
          >
            <template #default="{ index }">
              <button
                type="button"
                class="fontOtherItem"
                :class="{
                  active: isOtherFontSelected(filteredSystemFonts[index]),
                }"
                :style="{
                  fontFamily: cssFontFamilyStack([filteredSystemFonts[index]]),
                }"
                @click="chooseOtherFont(filteredSystemFonts[index])"
              >
                {{ filteredSystemFonts[index] }}
              </button>
            </template>
          </VirtualList>
        </template>
      </div>
    </div>
    </Teleport>
  </div>
</template>

<style scoped>
.fontPicker {
  position: relative;
  display: inline-flex;
}

.fontMenu--teleport {
  width: max-content;
  min-width: 140px;
  max-width: min(300px, calc(100vw - 16px));
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}

.fontMenu--layoutPending {
  opacity: 0;
  pointer-events: none;
}

.fontMenu--teleport::before,
.fontMenu--teleport::after {
  content: "";
  position: absolute;
  left: var(--font-menu-arrow-x, 50%);
  transform: translateX(-50%);
  width: 0;
  height: 0;
  pointer-events: none;
}

.fontMenu--teleport::before {
  top: -8px;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-bottom: 8px solid var(--border);
}

.fontMenu--teleport::after {
  top: -7px;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-bottom: 7px solid var(--bg);
}

.fontMenu--above::before,
.fontMenu--above::after {
  top: auto;
}

.fontMenu--above::before {
  bottom: -8px;
  border-bottom: none;
  border-top: 8px solid var(--border);
}

.fontMenu--above::after {
  bottom: -7px;
  border-bottom: none;
  border-top: 7px solid var(--bg);
}

.fontMenu {
  z-index: 7200;
}

.fontMenu--other {
  min-width: 280px;
  max-width: min(280px, calc(100vw - 16px));
}

.fontMenuDivider {
  flex-shrink: 0;
  height: 1px;
  background: var(--border);
}

.fontMenuDivider--inList {
  margin: 4px 0 8px;
}

.fontOtherPanel {
  display: flex;
  flex-direction: column;
  max-height: var(--font-menu-max-height, 70vh);
  min-height: 0; /* allow inner scroll */
}

.fontMenuList {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: var(--font-menu-max-height, 70vh);
  min-height: 0;
}

.fontMenuListBody {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 2px;
}

.fontMenuListFooter {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fontMenuItem {
  box-sizing: border-box;
  width: 100%;
  min-height: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  text-align: left;
  border: none;
  background: transparent;
  color: var(--list-item-fg);
  padding: 0 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
}

.fontMenuItem:hover {
  color: var(--list-item-fg);
  background: var(--list-item-bg-hover);
}

.fontMenuItem.active {
  color: var(--list-item-fg-active);
  background: var(--list-item-bg-active);
}

.fontMenuItemRow {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 36px;
  border-radius: 4px;
}

.fontMenuItemRow:hover {
  background: var(--list-item-bg-hover);
}

.fontMenuItemRow.active {
  background: var(--list-item-bg-active);
}

.fontMenuItemRow.active .fontMenuItem--other {
  color: var(--list-item-fg-active);
}

.fontMenuItem--other {
  flex: 1;
  min-width: 0;
}

.fontMenuItemRow:hover .fontMenuItem--other,
.fontMenuItemRow.active .fontMenuItem--other {
  background: transparent;
}

.fontMenuItem--other:hover {
  background: transparent;
}

.fontMenuPinBtn {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  margin-right: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--muted);
  transition: color 0.15s ease;
  padding: 0;
}

.fontMenuPinBtn:not(.fontMenuPinBtn--active) {
  opacity: 0;
  pointer-events: none;
}

.fontMenuItemRow:hover .fontMenuPinBtn:not(.fontMenuPinBtn--active),
.fontMenuItemRow:focus-within .fontMenuPinBtn:not(.fontMenuPinBtn--active) {
  opacity: 1;
  pointer-events: auto;
}

.fontMenuPinBtn--active {
  color: var(--primary);
}

.fontMenuPinBtn--active:hover {
  color: var(--muted);
}

.fontMenuPinBtn:hover:not(.fontMenuPinBtn--active) {
  color: var(--primary);
}

.fontMenuPinIcon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.fontMenuPinIcon :deep(svg) {
  width: 14px;
  height: 14px;
  display: block;
}

.fontMenuPinIcon :deep(svg path) {
  fill: currentColor;
}

.fontOtherFilterRow {
  padding: 0 6px 8px 6px;
  flex-shrink: 0;
}

.fontOtherFilterInput {
  width: 100%;
  box-sizing: border-box;
}

.fontOtherHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 6px 12px 6px;
}

.fontOtherTitle {
  font-size: 12px;
  color: var(--fg);
  white-space: nowrap;
  flex-shrink: 0;
}

.fontOtherHeader .btn {
  flex-shrink: 0;
}

.fontOtherLoading,
.fontOtherEmpty {
  padding: 10px;
  color: var(--muted);
  font-size: 12px;
}

.fontOtherLoading {
  display: flex;
  align-items: center;
  gap: 0.15em;
}

.fontOtherList {
  overflow: auto;
  padding-right: 2px;
  min-height: 0; /* allow flex overflow container to size correctly */
  flex: 1;
}

.fontOtherList :deep(.virtualList-row) {
  padding-bottom: 4px;
}

.fontOtherItem {
  text-align: left;
  border: none;
  background: transparent;
  color: var(--list-item-fg);
  box-sizing: border-box;
  height: 36px;
  min-height: 36px;
  padding: 0 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.fontOtherItem:hover {
  color: var(--list-item-fg);
  background: var(--list-item-bg-hover);
}

.fontOtherItem.active {
  color: var(--list-item-fg-active);
  background: var(--list-item-bg-active);
}
</style>
