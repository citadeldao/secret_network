import sha256Encode from 'crypto-js/sha256'
import Ledger from '@lunie/cosmos-ledger'
import { getCurrentDerivePathAndPubKey, isHardWallet, isSoftWallet } from '~/helpers'
import { NETWORKS_CONFIG } from '~/store/types'
const { EnigmaUtils, Secp256k1Pen, SigningCosmWasmClient } = require('secretjs')
const secp256k1 = require('secp256k1')
const crypto_1 = require('@iov/crypto')

const customFees = {
  upload: {
    amount: [{ amount: '2000000', denom: 'uscrt' }],
    gas: '2000000'
  },
  init: {
    amount: [{ amount: '500000', denom: 'uscrt' }],
    gas: '500000'
  },
  exec: {
    amount: [{ amount: '200000', denom: 'uscrt' }],
    gas: '500000'
  },
  send: {
    amount: [{ amount: '80000', denom: 'uscrt' }],
    gas: '80000'
  }
}

export default (_, inject) => {
  const txEncryptionSeed = EnigmaUtils.GenerateNewSeed()
  const httpUrl = 'https://api.secretapi.io'

  const snip20 = {
    /**
     * Get balance of certain snip20 token.
     * Does not require signature(privateKey).
     * @param {string} viewingKey
     * @param {string} walletAddress
     * @param {string} contractAddress
     * @returns {object} { error: false, amount: '0' } or { error: true, ...err }
     */
    async getBalance(viewingKey, walletAddress, contractAddress) {
      console.log('getBalance inputs', walletAddress, contractAddress)
      const client = new SigningCosmWasmClient(httpUrl, walletAddress, () => {}, txEncryptionSeed, customFees)

      try {
        // if successful returns { balance: { amount: '0' } }
        // if viewingkey does not match returns {
        //   viewing_key_error: { msg: 'Wrong viewing key for this address or viewing key not set' }
        // }
        const resp = await client.queryContractSmart(contractAddress, {
          balance: {
            key: viewingKey,
            address: walletAddress
          }
        })
        console.log('getBalance result', resp)
        if (resp.balance && resp.balance.amount) return { error: false, amount: resp.balance.amount }
        throw resp
      } catch (err) {
        console.error('error in snip20.getBalance', err)
        return { error: true, err }
      }
    },
    /**
     * Get transactions of certain snip20 token.
     * Does not require signature(privateKey).
     * @param {*} viewingKey
     * @param {*} walletAddress
     * @param {*} contractAddress
     * @returns {object} { error: false, txs: [] } or { error: true, ...err }
     */
    async getTransactions(viewingKey, walletAddress, contractAddress, page) {
      // console.log('getTransaction inputs', walletAddress, contractAddress, page)
      const client = new SigningCosmWasmClient(httpUrl, walletAddress, () => {}, txEncryptionSeed, customFees)

      try {
        // if viewingkey does not match returns {
        //   viewing_key_error: { msg: 'Wrong viewing key for this address or viewing key not set' }
        // }
        const resp = await client.queryContractSmart(contractAddress, {
          transfer_history: {
            key: viewingKey,
            address: walletAddress,
            page_size: 10,
            page
          }
        })
        // console.log('getTransactions result', resp)
        if (resp.transfer_history && resp.transfer_history.txs) return { error: false, txs: resp.transfer_history.txs }
        throw resp
      } catch (err) {
        // console.error('error in snip20.getTransactions', err)
        return { error: true, err }
      }
    },
    /**
     * Sets given viewing key to given snip20 token.
     * Requires signature(privateKey).
     * @param {string} viewingKey
     * @param {string} walletAddress
     * @param {string} contractAddress
     * @param {string} privateKey
     */
    async setViewingKey(viewingKey, walletAddress, contractAddress, privateKey, fee) {
      const uncompressedPk = (await crypto_1.Secp256k1.makeKeypair(privateKey)).pubkey
      const pubkey = crypto_1.Secp256k1.compressPubkey(uncompressedPk)
      const signingPen = new Secp256k1Pen(privateKey, pubkey)

      let feeObj = customFees
      if (fee) {
        feeObj = {
          upload: {
            amount: [{ amount: '2000000', denom: 'uscrt' }],
            gas: '2000000'
          },
          init: {
            amount: [{ amount: '500000', denom: 'uscrt' }],
            gas: '500000'
          },
          exec: {
            amount: [{ amount: (Number(fee) * 1000000).toString(), denom: 'uscrt' }],
            gas: '500000'
          },
          send: {
            amount: [{ amount: '80000', denom: 'uscrt' }],
            gas: '80000'
          }
        }
      }

      const client = new SigningCosmWasmClient(
        httpUrl,
        walletAddress,
        signBytes => signingPen.sign(signBytes),
        txEncryptionSeed,
        feeObj
      )

      try {
        const resp = await client.execute(contractAddress, {
          set_viewing_key: {
            key: viewingKey
          }
        })

        if (resp.transactionHash) return { error: false, transactionHash: resp.transactionHash }
        throw resp
      } catch (err) {
        console.error('error in snip20.setViewingKey', err)
        return { error: true, err }
      }
    },
    /**
     * Generate simple viewing key.
     * Simple viewing key is a viewing key generated on basis of privateKeyHash and contractAddress.
     * Which means always can be generate by us, and the result will be the same.
     * @param {string} privateKeyHash
     * @param {string} contractAddress
     * @returns {object}
     */
    generateSimpleViewingKey(privateKeyHash, contractAddress) {
      try {
        if (!privateKeyHash || !contractAddress) throw new Error('privateKeyHash or contractAddress is falsy')

        const viewingKey = `api_key_` + sha256Encode(contractAddress + privateKeyHash)
        return { error: false, viewingKey }
      } catch (err) {
        console.error('error in snip20.generateSimpleViewingKey', err)
        return { error: true, err }
      }
    },
    /**
     * generates viewing key using secretjs package method
     * @param {string} entropy
     * @param {string} walletAddress
     * @param {string} contractAddress
     * @param {string} privateKey
     * @param {number} walletType
     * @param {number|string} userId
     * @param {number|string} fee
     * @returns
     */
    async setRandomViewingKey(entropy, walletAddress, contractAddress, privateKey, walletType, userId, fee) {
      try {
        const sign = await this.getSignFunc({
          walletAddress,
          privateKey,
          walletType,
          userId
        })

        let feeObj = customFees
        if (fee) {
          feeObj = {
            upload: {
              amount: [{ amount: '2000000', denom: 'uscrt' }],
              gas: '2000000'
            },
            init: {
              amount: [{ amount: '500000', denom: 'uscrt' }],
              gas: '500000'
            },
            exec: {
              amount: [{ amount: (Number(fee) * 1000000).toString(), denom: 'uscrt' }],
              gas: '500000'
            },
            send: {
              amount: [{ amount: '80000', denom: 'uscrt' }],
              gas: '80000'
            }
          }
        }
        const client = new SigningCosmWasmClient(httpUrl, walletAddress, sign, txEncryptionSeed, feeObj)
        const resp = await client.execute(contractAddress, {
          create_viewing_key: {
            entropy
          }
        })

        const {
          create_viewing_key: { key: viewingKey }
        } = JSON.parse(Buffer.from(resp.data).toString('utf-8')) // o_o

        if (resp.transactionHash) return { error: false, transactionHash: resp.transactionHash, viewingKey }
        throw resp
      } catch (err) {
        console.error('error in snip20.setRandomViewingKey', err)
        return { error: true, err }
      }
    },
    /**
     * Transfer tokens, requires signing(privateKey)
     */
    async transfer(
      walletAddress,
      contractAddress,
      recipientAddress,
      privateKey,
      amount,
      fee,
      walletType,
      userId,
      decimals
    ) {
      const feeUscrt = (Number(fee) * 1000000).toString() // 1 000 000 is static becaue fee paid in SCRT
      const fees = {
        upload: {
          amount: [{ amount: '2000000', denom: 'uscrt' }],
          gas: '2000000'
        },
        init: {
          amount: [{ amount: '500000', denom: 'uscrt' }],
          gas: '500000'
        },
        exec: {
          amount: [{ amount: feeUscrt, denom: 'uscrt' }],
          gas: '500000'
        },
        send: {
          amount: [{ amount: '80000', denom: 'uscrt' }],
          gas: '80000'
        }
      }

      try {
        const sign = await this.getSignFunc({
          walletAddress,
          privateKey,
          walletType,
          userId
        })

        const client = new SigningCosmWasmClient(httpUrl, walletAddress, sign, txEncryptionSeed, fees)

        const amountValue = Number(amount) * 10 ** decimals
        const transferResult = await client.execute(contractAddress, {
          transfer: {
            owner: walletAddress,
            amount: amountValue.toString(),
            recipient: recipientAddress
          }
        })
        console.log('transfer result', transferResult)
        return { error: false, transferResult }
      } catch (err) {
        console.error('error in $snip.transfer', err)
        return { error: true, err }
      }
    },
    async convertScrtToEth(
      {
        walletAddress,
        contractAddress,
        toAddress,
        privateKey,
        amount,
        fee,
        walletType,
        userId,
        decimals,
        bridgeContract
      },
      { getSignFunc }
    ) {
      const feeUscrt = (Number(fee) * 1000000).toString() // 1 000 000 is static becaue fee paid in SCRT
      const fees = {
        upload: {
          amount: [{ amount: '2000000', denom: 'uscrt' }],
          gas: '2000000'
        },
        init: {
          amount: [{ amount: '500000', denom: 'uscrt' }],
          gas: '500000'
        },
        exec: {
          amount: [{ amount: feeUscrt, denom: 'uscrt' }],
          gas: '500000'
        },
        send: {
          amount: [{ amount: '80000', denom: 'uscrt' }],
          gas: '80000'
        }
      }

      try {
        const sign = await getSignFunc({
          walletAddress,
          privateKey,
          walletType,
          userId
        })
        const client = new SigningCosmWasmClient(httpUrl, walletAddress, sign, txEncryptionSeed, fees)
        const amountValue = Number(amount) * 10 ** Number(decimals)
        const convertResult = await client.execute(contractAddress, {
          send: {
            amount: amountValue.toString(), // сумма указывается без дробей, т.е. надо применить делитель по конкретному токену
            recipient: bridgeContract, // адрес бриджа из сикрета в эфир (для самого эфира и ерц2 токенов)
            msg: Buffer.from(toAddress).toString('base64') // эфирный адрес получателя
          }
        })
        console.log('transfer result convertScrtToEth', convertResult)
        return { error: false, convertResult }
      } catch (err) {
        console.error('error in convertScrtToEth', err)
        return { error: true, err }
      }
    },
    async convertScrtToSecretScrt(
      { walletAddress, privateKey, amount, fee, walletType, userId },
      { getSignFunc, getters }
    ) {
      const feeUscrt = (Number(fee) * 1000000).toString() // 1 000 000 is static becaue fee paid in SCRT
      const fees = {
        upload: {
          amount: [{ amount: '2000000', denom: 'uscrt' }],
          gas: '2000000'
        },
        init: {
          amount: [{ amount: '500000', denom: 'uscrt' }],
          gas: '500000'
        },
        exec: {
          amount: [{ amount: feeUscrt, denom: 'uscrt' }],
          gas: '500000'
        },
        send: {
          amount: [{ amount: '80000', denom: 'uscrt' }],
          gas: '80000'
        }
      }

      try {
        const sign = await getSignFunc({
          walletAddress,
          privateKey,
          walletType,
          userId
        })
        const client = new SigningCosmWasmClient(httpUrl, walletAddress, sign, txEncryptionSeed, fees)
        const sScrtContract =
          getters[NETWORKS_CONFIG.GETTER.GET_CONFIG] &&
          getters[NETWORKS_CONFIG.GETTER.GET_CONFIG].secret &&
          getters[NETWORKS_CONFIG.GETTER.GET_CONFIG].secret.tokens &&
          getters[NETWORKS_CONFIG.GETTER.GET_CONFIG].secret.tokens.secret_scrt &&
          getters[NETWORKS_CONFIG.GETTER.GET_CONFIG].secret.tokens.secret_scrt.address

        const amountValue = Number(amount) * 10 ** 6
        const convertResult = await client.execute(
          sScrtContract,
          {
            // DATA
            deposit: {
              padding: '6355a6f36bf44cc7'
            }
          },
          '', // memo
          [
            // sent_funds
            {
              denom: 'uscrt',
              amount: amountValue.toString()
            }
          ]
        )
        console.log('convert result convertScrtToSecretScrt', convertResult)
        return { error: false, convertResult }
      } catch (err) {
        console.error('error in $snip.convert SCRT > sSCRT', err)
        return { error: true, err }
      }
    },
    async convertSecretScrtToScrt(
      { walletAddress, privateKey, amount, fee, walletType, userId },
      { getSignFunc, getters }
    ) {
      const feeUscrt = (Number(fee) * 1000000).toString() // 1 000 000 is static becaue fee paid in SCRT
      const fees = {
        upload: {
          amount: [{ amount: '2000000', denom: 'uscrt' }],
          gas: '2000000'
        },
        init: {
          amount: [{ amount: '500000', denom: 'uscrt' }],
          gas: '500000'
        },
        exec: {
          amount: [{ amount: feeUscrt, denom: 'uscrt' }],
          gas: '500000'
        },
        send: {
          amount: [{ amount: '80000', denom: 'uscrt' }],
          gas: '80000'
        }
      }

      try {
        const sign = await getSignFunc({
          walletAddress,
          privateKey,
          walletType,
          userId
        })

        const client = new SigningCosmWasmClient(httpUrl, walletAddress, sign, txEncryptionSeed, fees)
        const sScrtContract =
          getters[NETWORKS_CONFIG.GETTER.GET_CONFIG] &&
          getters[NETWORKS_CONFIG.GETTER.GET_CONFIG].secret &&
          getters[NETWORKS_CONFIG.GETTER.GET_CONFIG].secret.tokens &&
          getters[NETWORKS_CONFIG.GETTER.GET_CONFIG].secret.tokens.secret_scrt &&
          getters[NETWORKS_CONFIG.GETTER.GET_CONFIG].secret.tokens.secret_scrt.address

        const amountValue = Number(amount) * 10 ** 6
        const convertResult = await client.execute(sScrtContract, {
          redeem: {
            amount: amountValue.toString(),
            padding: '1b31cef91c89a8ae'
          }
        })
        console.log('conver result convertSecretScrtToScrt', convertResult)
        return { error: false, convertResult }
      } catch (err) {
        console.error('error in $snip.convert sSCRT > SCRT', err)
        return { error: true, err }
      }
    },
    /**
     * Get signing function depending on wallet type
     * @param {Object} { walletAddress, privateKey, walletType, userId }
     * @returns {Function} function which is used to sign tx
     */
    async getSignFunc({ walletAddress, privateKey, walletType, userId }) {
      let sign = () => {}

      if (isSoftWallet(walletType)) {
        const uncompressedPk = (await crypto_1.Secp256k1.makeKeypair(privateKey)).pubkey
        const pubkey = crypto_1.Secp256k1.compressPubkey(uncompressedPk)
        const signingPen = new Secp256k1Pen(privateKey, pubkey)
        sign = signBytes => {
          const signed = signingPen.sign(signBytes)
          return signed
        }
      }

      if (isHardWallet(walletType)) {
        sign = async signBytes => {
          const [derivePath, publicKey] = getCurrentDerivePathAndPubKey(walletAddress, userId, 2)
          const ledger = new Ledger()
          await ledger.connect()
          const res = await ledger.cosmosApp.sign(derivePath.split('/').map(p => +p), signBytes)
          return {
            pub_key: {
              type: 'tendermint/PubKeySecp256k1',
              value: Buffer.from(publicKey.data).toString('base64')
            },
            signature: Buffer.from(secp256k1.signatureImport(res.signature)).toString('base64')
          }
        }
      }

      return sign
    }
  }
  inject('snip20', snip20)
}
