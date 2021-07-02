import { cloneDeep } from 'lodash'
import Vue from 'vue'
import netCurrencyTypes from './storeTypes/netCurrencyTypes'
import { INTERNAL_WALLET, NETWORKS_CONFIG, SNIP20 } from '@/store/types'
import { getTypeAndWalletId, isHardWallet } from '~/helpers'

export const namespaced = false

export const state = () => ({
  modalOpen: false,
  selected_snip20_token: null,

  /**
   * Contains token information for all secret addresses
   * Structure: {
   *  [secretAddress1]: {
   *    [contractAddress1]: {
   *      simpleViewingKey: string,         // generated when secret address is added, which means it's always has value
   *      viewingKey: string,               // generated randomly or imported by user
   *      availableType: 'svk | rvk | ivk', // svk - simple viewing key, rvk - random viewing key, ivk - imported viewing key
   *      isAvailable: true | false,        // if balance request was successful or not
   *      amount: '',                       // amount of tokens
   *      txs: [],                          // list of transactions
   *      totalTxs: 0 | null,                      // (may not come from request) amount of transactions
   *      isLoading: false,
   *      ...(other token info: code, net, etc.)
   *    },
   *    [contractAddress2]: {}
   *  },
   *  [secretAddress2]: {}
   * }
   */
  snip20Info: null,
  snip20InfoLoading: false,

  /**
   * Defines which modal should be shown
   * There are 3 modals
   * values: '' | 'generate' | 'import' | 'success'
   */
  vkModal: null,
  /**
   * Data used in modal for creating viewingKey
   */
  vkModalData: null,
  /**
   * If confirmation of viewingKey is loading
   */
  confirmLoading: false,
  /**
   * If any token is being loaded
   */
  tokenLoading: false
})

export const getters = {
  [SNIP20.GETTER.GET_MODAL_OPEN]: state => state.modalOpen,
  [SNIP20.GETTER.GET_SELECTED_TOKEN]: state => state.selected_snip20_token,
  [SNIP20.GETTER.GET_SNIP20_INFO]: state => state.snip20Info,
  [SNIP20.GETTER.GET_VK_MODAL]: state => state.vkModal,
  [SNIP20.GETTER.GET_VK_MODAL_DATA]: state => state.vkModalData,
  [SNIP20.GETTER.GET_CONFIRM_LOADING]: state => state.confirmLoading,
  [SNIP20.GETTER.GET_SNIP20_INFO_LOADING]: state => state.snip20InfoLoading,
  [SNIP20.GETTER.GET_TOKEN_LOADING]: state => state.tokenLoading
}

export const mutations = {
  [SNIP20.MUTATION.SET_MODAL_OPEN]: (state, value) => (state.modalOpen = value),
  [SNIP20.MUTATION.SET_SELECTED_TOKEN]: (state, value) => (state.selected_snip20_token = cloneDeep(value)),
  [SNIP20.MUTATION.SET_SNIP20_INFO]: (state, value) => (state.snip20Info = cloneDeep(value)),
  [SNIP20.MUTATION.SET_SNIP20_INFO_ADDRESS]: (state, { walletAddress, value }) => {
    if (!state.snip20Info) state.snip20Info = {}
    Vue.set(state.snip20Info, walletAddress, value)
  },
  [SNIP20.MUTATION.SET_SNIP20_INFO_ADDRESS_TOKEN]: (state, { walletAddress, contractAddress, value }) => {
    if (!state.snip20Info) state.snip20Info = {}
    if (!state.snip20Info[walletAddress]) Vue.set(state.snip20Info, walletAddress, {})
    if (!state.snip20Info[walletAddress][contractAddress]) Vue.set(state.snip20Info[walletAddress], contractAddress, {})
    Vue.set(state.snip20Info[walletAddress], contractAddress, {
      ...state.snip20Info[walletAddress][contractAddress],
      ...value
    })
  },
  [SNIP20.MUTATION.SET_VK_MODAL]: (state, value) => (state.vkModal = value),
  [SNIP20.MUTATION.SET_VK_MODAL_DATA]: (state, value) => (state.vkModalData = cloneDeep(value)),
  [SNIP20.MUTATION.SET_CONFIRM_LOADING]: (state, value) => (state.confirmLoading = value),
  [SNIP20.MUTATION.SET_SNIP20_INFO_LOADING]: (state, value) => (state.snip20InfoLoading = value),
  [SNIP20.MUTATION.SET_TOKEN_LOADING]: (state, value) => (state.tokenLoading = value),
  [SNIP20.MUTATION.DELETE_TOKEN]: (state, { walletAddress, contractAddress }) =>
    delete state.snip20Info[walletAddress][contractAddress]
}

export const actions = {
  [SNIP20.ACTION.CREATE_SNIP20_STRUCTURE]({ getters, commit }, { walletAddress, privateKeyHash }) {
    const tokens = getters[NETWORKS_CONFIG.GETTER.GET_CONFIG].secret.tokens
    const internalWallet = getters[INTERNAL_WALLET.GETTER.GET_WALLETS]
    const [walletType] = getTypeAndWalletId({ net: 'secret', address: walletAddress, publicKey: '' }, internalWallet)
    if (isHardWallet(walletType)) {
      Object.keys(tokens).forEach(tkn => {
        if (
          !(
            getters[SNIP20.GETTER.GET_SNIP20_INFO] &&
            getters[SNIP20.GETTER.GET_SNIP20_INFO][walletAddress] &&
            getters[SNIP20.GETTER.GET_SNIP20_INFO][walletAddress][tokens[tkn].address] &&
            getters[SNIP20.GETTER.GET_SNIP20_INFO][walletAddress][tokens[tkn].address].viewingKey &&
            getters[SNIP20.GETTER.GET_SNIP20_INFO][walletAddress][tokens[tkn].address].code
          )
        ) {
          commit(SNIP20.MUTATION.SET_SNIP20_INFO_ADDRESS_TOKEN, {
            walletAddress,
            contractAddress: tokens[tkn].address,
            value: {
              ...tokens[tkn],
              simpleViewingKey: '',
              viewingKey: '',
              availableType: '',
              isAvailable: false,
              amount: '',
              txs: [],
              isLoading: false
            }
          })
        }
      })
    } else {
      Object.keys(tokens).forEach(tkn => {
        // if no simpleViewingKey for contractAddress, create SVK
        if (
          !getters[SNIP20.GETTER.GET_SNIP20_INFO] ||
          !getters[SNIP20.GETTER.GET_SNIP20_INFO][walletAddress] ||
          !getters[SNIP20.GETTER.GET_SNIP20_INFO][walletAddress][tokens[tkn].address] ||
          (!getters[SNIP20.GETTER.GET_SNIP20_INFO][walletAddress][tokens[tkn].address].simpleViewingKey &&
            (getters[SNIP20.GETTER.GET_SNIP20_INFO][walletAddress][tokens[tkn].address].availableType === 'svk' ||
              getters[SNIP20.GETTER.GET_SNIP20_INFO][walletAddress][tokens[tkn].address].availableType === '')) ||
          !getters[SNIP20.GETTER.GET_SNIP20_INFO][walletAddress][tokens[tkn].address].code
        ) {
          let svk
          if (privateKeyHash) svk = this.$snip20.generateSimpleViewingKey(privateKeyHash, tokens[tkn].address)
          else svk = { error: true }

          if (svk.error) {
            commit(SNIP20.MUTATION.SET_SNIP20_INFO_ADDRESS_TOKEN, {
              walletAddress,
              contractAddress: tokens[tkn].address,
              value: {
                ...tokens[tkn],
                simpleViewingKey: '',
                viewingKey: '',
                availableType: '',
                isAvailable: false,
                amount: '',
                txs: [],
                isLoading: false
              }
            })
            return
          }
          commit(SNIP20.MUTATION.SET_SNIP20_INFO_ADDRESS_TOKEN, {
            walletAddress,
            contractAddress: tokens[tkn].address,
            value: {
              ...tokens[tkn],
              simpleViewingKey: svk.viewingKey,
              viewingKey: '',
              availableType: 'svk',
              amount: '',
              txs: [],
              isLoading: false
            }
          })
        }
      })
    }
  },
  async [SNIP20.ACTION.LOAD_SNIP20_INFO]({ getters, dispatch, commit }, { walletAddress, privateKeyHash }) {
    const loading = getters[SNIP20.GETTER.GET_SNIP20_INFO_LOADING]
    /* if process already started - return */
    if (loading) return
    try {
      commit(SNIP20.MUTATION.SET_SNIP20_INFO_LOADING, true)

      dispatch(SNIP20.ACTION.CREATE_SNIP20_STRUCTURE, { walletAddress, privateKeyHash })

      const loadTokenBalance = Object.keys(getters[SNIP20.GETTER.GET_SNIP20_INFO][walletAddress]).filter(
        contractAddress => getters[SNIP20.GETTER.GET_SNIP20_INFO][walletAddress][contractAddress].favorite
      )

      for (const contractAddress of loadTokenBalance) {
        await dispatch(SNIP20.ACTION.LOAD_TOKEN_BALANCE, {
          walletAddress,
          contractAddress
        })
      }

      const loadTokenTransactions = Object.keys(getters[SNIP20.GETTER.GET_SNIP20_INFO][walletAddress]).filter(
        contractAddress => getters[SNIP20.GETTER.GET_SNIP20_INFO][walletAddress][contractAddress].favorite
      )

      for (const contractAddress of loadTokenTransactions) {
        await dispatch(SNIP20.ACTION.LOAD_TOKEN_TRANSACTIONS, {
          walletAddress,
          contractAddress
        })
      }
    } catch (err) {
      console.error('Error in SNIP20.ACTION.LOAD_SNIP20_INFO', err)
    } finally {
      commit(SNIP20.MUTATION.SET_SNIP20_INFO_LOADING, false)
    }
  },
  async [SNIP20.ACTION.LOAD_TOKEN_BALANCE]({ commit, getters, dispatch }, { walletAddress, contractAddress }) {
    const token = getters[SNIP20.GETTER.GET_SNIP20_INFO][walletAddress][contractAddress]
    let newToken = {}
    let success = false

    const otherVk = getters[SNIP20.GETTER.GET_SNIP20_INFO][walletAddress][contractAddress].viewingKey
    const simpleVk = getters[SNIP20.GETTER.GET_SNIP20_INFO][walletAddress][contractAddress].simpleViewingKey

    let simpleVkError = null
    let otherVkError = null
    let isError = null

    /* checking rvk | ivk */
    if (otherVk && ['rvk', 'ivk'].includes(token.availableType)) {
      const result = await this.$snip20.getBalance(otherVk, walletAddress, contractAddress)
      if (!result.error) {
        newToken = {
          isAvailable: true,
          availableType: token.availableType,
          amount: result.amount
        }
        success = true
      } else {
        otherVkError = result.err
        isError = true
      }
    }

    if (otherVkError && otherVkError.viewing_key_error)
      commit(SNIP20.MUTATION.SET_SNIP20_INFO_ADDRESS_TOKEN, {
        walletAddress,
        contractAddress,
        value: {
          isAvailable: false,
          availableType: 'svk',
          viewingKey: '',
          amount: ''
        }
      })

    /* checking svk */
    if (!success && simpleVk) {
      const result = await this.$snip20.getBalance(simpleVk, walletAddress, contractAddress)
      if (!result.error && result.amount) {
        newToken = {
          isAvailable: true,
          availableType: 'svk',
          viewingKey: '',
          amount: result.amount
        }
        success = true
        isError = false
      } else {
        simpleVkError = result.err
        isError = true
      }
    }

    if (simpleVkError && simpleVkError.viewing_key_error)
      commit(SNIP20.MUTATION.SET_SNIP20_INFO_ADDRESS_TOKEN, {
        walletAddress,
        contractAddress,
        value: {
          isAvailable: false,
          availableType: 'svk',
          viewingKey: '',
          amount: ''
        }
      })

    let tkn = null

    if (success) {
      tkn = { walletAddress, contractAddress, value: newToken }
      if (!getters[netCurrencyTypes.GET_FEES_BY_NET](token.net)) {
        await dispatch(netCurrencyTypes.LOAD_FEES_BY_NET, { net: token.net })
      }
      isError = false
      commit(SNIP20.MUTATION.SET_SNIP20_INFO_ADDRESS_TOKEN, tkn)
    }

    return { isError, simpleVkError, otherVkError, ...tkn }
  },
  async [SNIP20.ACTION.LOAD_TOKEN_TRANSACTIONS]({ commit, getters }, { walletAddress, contractAddress, page }) {
    const token = getters[SNIP20.GETTER.GET_SNIP20_INFO][walletAddress][contractAddress]
    let newToken = {}
    let success = false

    const otherVk = getters[SNIP20.GETTER.GET_SNIP20_INFO][walletAddress][contractAddress].viewingKey
    const simpleVk = getters[SNIP20.GETTER.GET_SNIP20_INFO][walletAddress][contractAddress].simpleViewingKey

    let simpleVkError = null
    let otherVkError = null
    let isError = null

    /* checking rvk | ivk */
    if (otherVk && ['rvk', 'ivk'].includes(token.availableType)) {
      const result = await this.$snip20.getTransactions(otherVk, walletAddress, contractAddress, page)
      if (!result.error && result.txs) {
        newToken = {
          isAvailable: true,
          availableType: token.availableType,
          txs: result.txs,
          totalTxs: result.total || null
        }
        success = true
      } else {
        otherVkError = result.err
        isError = true
      }
    }

    if (otherVkError && otherVkError.viewing_key_error) {
      commit(SNIP20.MUTATION.SET_SNIP20_INFO_ADDRESS_TOKEN, {
        walletAddress,
        contractAddress,
        value: {
          isAvailable: false,
          availableType: 'svk',
          viewingKey: '',
          txs: [],
          totalTxs: null
        }
      })
    }

    /* checking svk */
    if (!success && simpleVk) {
      const result = await this.$snip20.getTransactions(simpleVk, walletAddress, contractAddress, page)
      if (!result.error && result.txs) {
        newToken = {
          isAvailable: true,
          availableType: 'svk',
          viewingKey: '',
          txs: result.txs,
          totalTxs: result.total || null
        }
        success = true
        isError = false
      } else {
        simpleVkError = result.err
        isError = true
      }
    }

    if (simpleVkError && simpleVkError.viewing_key_error) {
      commit(SNIP20.MUTATION.SET_SNIP20_INFO_ADDRESS_TOKEN, {
        walletAddress,
        contractAddress,
        value: {
          isAvailable: false,
          availableType: 'svk',
          viewingKey: '',
          txs: [],
          totalTxs: null
        }
      })
    }

    let tkn = null

    if (success) {
      tkn = { walletAddress, contractAddress, value: newToken }
      console.log(tkn)
      isError = false
      commit(SNIP20.MUTATION.SET_SNIP20_INFO_ADDRESS_TOKEN, tkn)
    }

    return { isError, simpleVkError, otherVkError, ...tkn }
  }
}
