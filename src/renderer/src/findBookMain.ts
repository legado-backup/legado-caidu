import "monaco-editor/esm/nls.messages.zh-cn.js";
import { createApp } from "vue";
import FindBookWindow from "./FindBookWindow.vue";
import "./style.css";
import "./styles/settingsPanel.css";
import { installEscapeBlurTextFieldListener } from "./utils/escapeBlurTextField";
import { ensureSystemFontCatalog } from "./utils/systemFontCatalog";

installEscapeBlurTextFieldListener();
void ensureSystemFontCatalog();
createApp(FindBookWindow).mount("#app");
