// import Vue from 'vue'
import netCurrencyTypes from './storeTypes/netCurrencyTypes'
import { BRIDGE } from '@/store/types'
import { getMainNet } from '~/helpers'

export const namespaced = false

export const state = () => ({
  isBridgeOperation: false,
  bridgeError: null,
  approveTx: null,
  disapproveTx: null,
  minAmount: 0
})

export const getters = {
  [BRIDGE.GETTER.GET_IS_BRIDGE_OPERATION]: state => state.isBridgeOperation,
  [BRIDGE.GETTER.GET_ERROR]: state => state.bridgeError,
  [BRIDGE.GETTER.GET_APPROVE_TX]: state => state.approveTx,
  [BRIDGE.GETTER.GET_DISAPPROVE_TX]: state => state.disapproveTx,
  [BRIDGE.GETTER.GET_MIN_AMOUNT]: state => state.minAmount
}

export const mutations = {
  [BRIDGE.MUTATION.SET_IS_BRIDGE_OPERATION]: (state, value) => (state.isBridgeOperation = value),
  [BRIDGE.MUTATION.SET_ERROR]: (state, value) => (state.bridgeError = value),
  [BRIDGE.MUTATION.SET_APPROVE_TX]: (state, value) => (state.approveTx = value),
  [BRIDGE.MUTATION.SET_DISAPPROVE_TX]: (state, value) => (state.disapproveTx = value),
  [BRIDGE.MUTATION.SET_MIN_AMOUNT]: (state, value) => (state.minAmount = value)
}

export const actions = {
  async [BRIDGE.ACTION.LOAD_BUILD_BRIDGE_OR_FEE](context, { net, address, targetNet, to, amount }) {
    try {
      const buildInfo = await bridgeFunc(net)({ net, address, targetNet, to, amount }, this.$api, context)
      return buildInfo
    } catch (err) {
      throw err
    }
  },
  async [BRIDGE.ACTION.LOAD_MIN_AMOUNT]({ commit }, { net, targetNet }) {
    try {
      const resp = await this.$api.getMinBridgeAmount({ net, targetNet })
      commit(BRIDGE.MUTATION.SET_MIN_AMOUNT, resp.data)
    } catch (err) {
      console.error('Error in getting min amount for bridge')
      console.error(err)
      commit(BRIDGE.MUTATION.SET_MIN_AMOUNT, 0)
    }
  }
}

const ethBuildBridge = async function({ net, address, targetNet, to, amount }, $api) {
  try {
    const bridgeResponse = await $api.getBuildBridge({
      net,
      address,
      targetNet,
      to,
      amount
    })

    return { ok: true, ...bridgeResponse.data }
  } catch (err) {
    throw err
  }
}

const scrtToEthFee = async ({ net }, $api) => {
  try {
    const scrtFeeResponse = await $api.getBridgeScrtToEthFee({
      net
    })
    return { ok: true, ...scrtFeeResponse.data, fee: scrtFeeResponse.data.origin }
  } catch (err) {
    throw err
  }
}

const scrtSnipFee = async (_, __, $store) => {
  try {
    if (!$store.getters[netCurrencyTypes.GET_FEES_BY_NET]('secret_scrt')) {
      await $store.dispatch(netCurrencyTypes.LOAD_FEES_BY_NET, { net: 'secret_scrt' })
    }
    const fee = $store.getters[netCurrencyTypes.GET_FEES_BY_NET]('secret_scrt')
    return { ok: true, fee: fee.low.fee }
  } catch (err) {
    throw err
  }
}

const mapNetToBridge = {
  eth: ethBuildBridge,
  secret: scrtToEthFee,
  secret_scrt: scrtSnipFee
}

const bridgeFunc = net => {
  if (net === 'secret' || net === 'secret_scrt') return mapNetToBridge.secret_scrt
  return mapNetToBridge[getMainNet(net)]
}
