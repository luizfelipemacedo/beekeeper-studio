import _ from 'lodash'
import { Module } from "vuex";

import { State as RootState } from '../index'
import { upsert } from './data/StoreHelpers';
import { CloudError } from '@/lib/cloud/ClientHelpers';
import { CloudClient } from '@/lib/cloud/CloudClient';
import { TransportLicenseKey } from '@/common/transport';
import Vue from "vue"

interface State {
  licenses: TransportLicenseKey[],
  loading: boolean
  error: CloudError | Error | null
  date: Date
}


const oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds

export const LicenseModule: Module<State, RootState>  = {
  namespaced: true,
  state: () => ({
    licenses: [],
    loading: false,
    error: null,
    date: new Date(),
  }),
  getters: {
    newestLicense(state) {
      return _.orderBy(state.licenses, ['validUntil'], ['desc'])[0] || {} as TransportLicenseKey
    },
    realLicenses(state) {
      return state.licenses.filter((l) => l.licenseType !== 'TrialLicense')
    },
    hasActiveLicense(state) {
      return state.licenses.some((l) => l.active);
    },
    isTrial(state, getters) {
      return getters.newestLicense.licenseType === 'TrialLicense'
        && getters.trialLicense.validUntil > state.date
    },
    trialDaysLeft(state, getters) {
      const validUntil = getters.trialLicense.validUntil.getTime()
      const now = state.date.getTime()
      return Math.round((validUntil - now) / oneDay);
    },
    trialLicense(state) {
      const l = state.licenses.find((l) => l.licenseType === 'TrialLicense')
      return {
        ...l,
        validUntil: new Date(new Date().getTime() + (10 * 1000)),
      }
    },
  },

  mutations: {
    set(state, licenses: TransportLicenseKey[]) {
      state.licenses = licenses
    },
    add(state, license: TransportLicenseKey) {
      upsert(state.licenses, license, (a, b) => a.key === b.key && a.email === b.email)
    },
    remove(state, licenses: TransportLicenseKey[]) {
      state.licenses = _.without(state.licenses, ...licenses)
    },
    setDate(state, date: Date) {
      state.date = date
    },
  },
  actions: {
    async init(context) {
      const licenses = await Vue.prototype.$util.send('appdb/license/find');
      context.commit('set', licenses)
      context.dispatch('updateAll')
    },

    async add(context, { email, key }) {

      const result = await CloudClient.getLicense(window.platformInfo.cloudUrl, email, key)
      // if we got here, license is good.
      let license = {} as TransportLicenseKey
      license.key = key
      license.email = email
      license.validUntil = new Date(result.validUntil)
      license.supportUntil = new Date(result.supportUntil)
      license.licenseType = result.licenseType
      const others = context.getters.realLicenses
      license = await Vue.prototype.$util.send('appdb/license/save', { obj: license });
      await Vue.prototype.$util.send('appdb/license/remove', { obj: others });
      context.commit('add', license)
      context.commit('remove', others)
    },

    async update(_context, license: TransportLicenseKey) {
      try {
        const data = await CloudClient.getLicense(window.platformInfo.cloudUrl, license.email, license.key)
        license.validUntil = new Date(data.validUntil)
        license.supportUntil = new Date(data.supportUntil)
        license = await Vue.prototype.$util.send('appdb/license/save', { obj: license });
      } catch (error) {
        if (error instanceof CloudError) {
          // eg 403, 404, license not valid
          license.validUntil = new Date()
          license = await Vue.prototype.$util.send('appdb/license/save', { obj: license });
        } else {
          // eg 500 errors
          // do nothing
        }

      }

    },

    async updateAll(context) {
      for (let index = 0; index < context.getters.realLicenses.length; index++) {
        const license = context.getters.realLicenses[index];
        await context.dispatch('update', license)
      }
    },

    /** Use this to update the trial getters */
    updateDate(context) {
      context.commit('setDate', new Date())
    },
  }
}
