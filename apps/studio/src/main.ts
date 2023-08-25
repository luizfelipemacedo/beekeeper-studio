import tls from 'tls'
import Vue from 'vue'
import VueHotkey from 'v-hotkey'
import VTooltip from 'v-tooltip'
import VModal from 'vue-js-modal'
import 'xel/xel'
import 'codemirror/addon/comment/comment'
import 'codemirror/addon/dialog/dialog'
import 'codemirror/addon/search/search'
import 'codemirror/addon/search/jump-to-line'
import 'codemirror/addon/scroll/annotatescrollbar'
import 'codemirror/addon/search/matchesonscrollbar'
import 'codemirror/addon/search/matchesonscrollbar.css'
import 'codemirror/addon/search/searchcursor'
import { TabulatorFull as Tabulator } from 'tabulator-tables'
import './filters/pretty-bytes-filter'
import PortalVue from 'portal-vue'
import App from './App.vue'
import 'typeface-roboto'
import 'typeface-source-code-pro'
import './assets/styles/app.scss'
import $ from 'jquery'

import 'codemirror/mode/sql/sql'
import 'codemirror/mode/diff/diff'
import './vendor/sql-hint'
import './vendor/show-hint'

import store from './store/index'
import 'reflect-metadata'
import {TypeOrmPlugin} from './lib/typeorm_plugin'
import config from './config'
import ConfigPlugin from './plugins/ConfigPlugin'
import { VueElectronPlugin } from './lib/NativeWrapper'
import { ipcRenderer } from 'electron'
import AppEventHandler from './lib/events/AppEventHandler'
import Connection from './common/appdb/Connection'
import xlsx from 'xlsx'
import TimeAgo from 'javascript-time-ago'
import en from 'javascript-time-ago/locale/en'
import log from 'electron-log'
import VueClipboard from 'vue-clipboard2'
import platformInfo from './common/platform_info'
import { AppEventMixin } from './common/AppEvent'
import BeekeeperPlugin from './plugins/BeekeeperPlugin'
import 'codemirror/addon/merge/merge'
import _ from 'lodash'
import NotyPlugin from '@/plugins/NotyPlugin'
import './common/initializers/big_int_initializer.ts'
import SettingsPlugin from './plugins/SettingsPlugin'

(async () => {
  try {

    _.mixin({
      'deepMapKeys': function (obj, fn) {

        const x = {};

        _.forOwn(obj, function (rawV, k) {
          let v = rawV
          if (_.isPlainObject(v)) {
            v = _.deepMapKeys(v, fn);
          } else if (_.isArray(v)) {
            v = v.map((item) => _.deepMapKeys(item, fn))
          }
          x[fn(v, k)] = v;
        });

        return x;
      }
    });
    const transports = [log.transports.console, log.transports.file]
    if (platformInfo.isDevelopment || platformInfo.debugEnabled) {
      transports.forEach(t => t.level = 'silly')
    } else {
      transports.forEach(t => t.level = 'warn')
    }

    log.info("starting logging")
    tls.DEFAULT_MIN_VERSION = "TLSv1"
    TimeAgo.addLocale(en)
    Tabulator.defaultOptions.layout = "fitDataFill";
    // @ts-expect-error default options not fully typed
    Tabulator.defaultOptions.menuContainer = ".beekeeper-studio-wrapper";
    // Tabulator.prototype.bindModules([EditModule]);
    const appDb = platformInfo.appDbPath
    const connection = new Connection(appDb, config.isDevelopment ? true : ['error'])
    await connection.connect();

    (window as any).$ = $;
    (window as any).jQuery = $;
    // (window as any).sql = SQL;
    // (window as any).hint = Hint;
    // (window as any).SQLHint = SQLHint;
    (window as any).XLSX = xlsx;
    Vue.config.devtools = platformInfo.isDevelopment;

    Vue.mixin(AppEventMixin)
    Vue.mixin({
      methods: {
        ctrlOrCmd(key) {
          if (this.$config.isMac) return `meta+${key}`
          return `ctrl+${key}`
        },
        // codemirror sytax
        cmCtrlOrCmd(key: string) {
          if (this.$config.isMac) return `Cmd-${key}`
          return `Ctrl-${key}`
        },
        selectChildren(element) {
          const selection = window.getSelection()
          if (selection) {
            selection.selectAllChildren(
              element
            );

          } else {
            console.log("no selection")
          }
        },

      }
    })

    Vue.config.productionTip = false
    Vue.use(TypeOrmPlugin, {connection})
    Vue.use(VueHotkey)
    Vue.use(VTooltip, { defaultHtml: false, })
    Vue.use(VModal)
    Vue.use(VueClipboard)
    Vue.use(ConfigPlugin)
    Vue.use(BeekeeperPlugin)
    Vue.use(SettingsPlugin)
    Vue.use(VueElectronPlugin)
    Vue.use(PortalVue)
    Vue.use(NotyPlugin, {
      timeout: 2300,
      progressBar: true,
      layout: 'bottomRight',
      theme: 'mint',
      closeWith: ['button', 'click'],
    })

    const app = new Vue({
      render: h => h(App),
      store,
    })
    await app.$store.dispatch('settings/initializeSettings')
    const handler = new AppEventHandler(ipcRenderer, app)
    handler.registerCallbacks()
    app.$mount('#app')
  } catch (err) {
    console.error("ERROR INITIALIZING APP")
    console.error(err)
    throw err
  }
})();
