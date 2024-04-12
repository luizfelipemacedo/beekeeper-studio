import config from "@/config";
import _ from "lodash";
import platformInfo from "@/common/platform_info";
import { AppEvent } from "@/common/AppEvent";
import { ipcRenderer } from "electron";
import { VueConstructor } from "vue/types/umd";
import {
  BkConfig,
  KeybindingPath,
  watchConfigFile,
} from "@/lib/config/configLoader";

export function createVHotkeyKeymap(
  obj: Partial<Record<KeybindingPath, any>>
): Record<string, any> {
  const keymap = {};

  for (const path of Object.keys(obj) as KeybindingPath[]) {
    const value = obj[path];
    const keybindings = BkConfig.getKeybindings("v-hotkey", path);
    if (typeof keybindings === "string") {
      keymap[keybindings] = value;
    } else {
      keybindings.forEach((keybinding) => {
        keymap[keybinding] = value;
      });
    }
  }

  return keymap;
}

export type createVHotkeyKeymapFunc = typeof createVHotkeyKeymap;

export default {
  install(Vue: VueConstructor) {
    if (platformInfo.isDevelopment) {
      watchConfigFile({
        type: "default",
        callback: () => ipcRenderer.send(AppEvent.menuClick, "reload"),
      });

      watchConfigFile({
        type: "user",
        callback: () => ipcRenderer.send(AppEvent.menuClick, "reload"),
      });
    }

    window.BkConfig = BkConfig;

    Vue.prototype.$bkConfig = BkConfig;
    Vue.prototype.$config = config;
    Vue.prototype.$vHotkeyKeymap = createVHotkeyKeymap;
  },
};
