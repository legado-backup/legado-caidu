import { createApp } from "vue";
import StealthReaderApp from "./StealthReaderApp.vue";
import { ensureSystemFontCatalog } from "./utils/systemFontCatalog";

void ensureSystemFontCatalog();
createApp(StealthReaderApp).mount("#app");
