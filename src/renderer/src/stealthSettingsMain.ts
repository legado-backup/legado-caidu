import { createApp } from "vue";
import StealthSettingsApp from "./StealthSettingsApp.vue";
import "./style.css";
import "./styles/settingsPanel.css";
import { installEscapeBlurTextFieldListener } from "./utils/escapeBlurTextField";
import { ensureSystemFontCatalog } from "./utils/systemFontCatalog";

installEscapeBlurTextFieldListener();
void ensureSystemFontCatalog();
createApp(StealthSettingsApp).mount("#app");
