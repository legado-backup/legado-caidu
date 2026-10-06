import {
  buildListedSystemFonts,
  buildSystemFontFaceCss,
  familyNamesToRawFaces,
  type RawSystemFontFace,
} from "@shared/systemFontFace";

const STYLE_ID = "colortxt-system-font-faces";

let catalogPromise: Promise<string[]> | null = null;
let markReady: (() => void) | null = null;
const readyPromise = new Promise<void>((resolve) => {
  markReady = resolve;
});

function installFaceCss(css: string): void {
  if (!css || typeof document === "undefined") return;
  let el = document.getElementById(STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

function asRawFaces(raw: unknown): RawSystemFontFace[] {
  if (!Array.isArray(raw)) return [];
  const faces: RawSystemFontFace[] = [];
  const legacyNames: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      legacyNames.push(item);
      continue;
    }
    if (
      item &&
      typeof item === "object" &&
      typeof (item as RawSystemFontFace).family === "string"
    ) {
      faces.push(item as RawSystemFontFace);
    }
  }
  if (faces.length > 0) return faces;
  return familyNamesToRawFaces(legacyNames);
}

async function loadCatalog(): Promise<string[]> {
  const listFn = window.colorTxt?.listSystemFonts;
  if (typeof listFn !== "function") return [];
  const listed = buildListedSystemFonts(asRawFaces(await listFn()));
  installFaceCss(buildSystemFontFaceCss(listed));
  return listed.map((font) => font.name);
}

/** 枚举系统字体字重并注入 @font-face。多次调用共用同一次结果。 */
export function ensureSystemFontCatalog(): Promise<string[]> {
  if (!catalogPromise) {
    catalogPromise = loadCatalog()
      .catch((err) => {
        console.warn("[fonts] system font catalog failed", err);
        return [] as string[];
      })
      .finally(() => {
        markReady?.();
      });
  }
  return catalogPromise;
}

/** 字重 @font-face 已尝试注入（成功或失败都会结束）。 */
export function whenSystemFontFacesReady(): Promise<void> {
  void ensureSystemFontCatalog();
  return readyPromise;
}
