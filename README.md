# Citadel.one and SNIP-20 tokens interactions
## 1) Add SNIP-20 tokens to Citadel.one

     
For direct interaction with secret contracts without using a server, we had to use the "secretjs" library developed specifically for this purpose.
Our goal was to integrate a new independent algorithm for receiving data and sending it using existing wallet keys from.

To begin with, you will need to connect two important libraries for interacting with contracts.
```js
const {
    EnigmaUtils, Secp256k1Pen, SigningCosmWasmClient
} = require("secretjs");
const crypto = require("@iov/crypto");
```

In the browser, we store the private key (in encrypted form) and the wallet address, however, for the library, it is necessary to provide a public and private key in a suitable form.
Therefore, we need to produce a public key from the private one.
```js
const privkey = Buffer.from('504c3b9b6b.....07cc1bfe06', 'hex');
const uncompressedPk = (await crypto.Secp256k1.makeKeypair(privkey)).pubkey;
const pubkey = crypto.Secp256k1.compressPubkey(uncompressedPk);
```

Having received the public key in the desired form, you can initialize the transaction signing function:

```js
const signingPen = new Secp256k1Pen(privkey, pubkey);
```

signingPen is a signing function that is used if we have access to the private key
If the user is using Ledger, a different signature function must be used.
To implement the signature function via Ledger, we use the '@ lunie / cosmos-ledger' library, import it as follows:
        import Ledger from '@lunie/cosmos-ledger'


To determine which signature function is needed, use the getSignFunc method
```js
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
```   
    
Having received a function for signing transactions, we can initialize our client
```js
const httpUrl = 'https://api.secretapi.io'; // public rest api node
const address = 'secret14u....'; // user's address
const txEncryptionSeed = EnigmaUtils.GenerateNewSeed(); // secret seed
const sign = await this.getSignFunc({   // singing function
    walletAddress,
    privateKey,
    walletType,
    userId
})

const client = new SigningCosmWasmClient(
    httpUrl,
    address,
    sign,
    txEncryptionSeed
);
```

When using Ledger, you need to change the signature function

When we only need to read data from contracts, we need a viewing key and do not need a private key
```js
const client = new SigningCosmWasmClient(
    httpUrl,
    address,
    () => {},
    txEncryptionSeed
);
```

The library also provides us with the ability to change commissions, this is done by installing an additional option
```js
const customFees = {
    upload: {
        amount: [{ amount: "2000000", denom: "uscrt" }],
        gas: "2000000",
    },
    init: {
        amount: [{ amount: "500000", denom: "uscrt" }],
        gas: "500000",
    },
    exec: {
        amount: [{ amount: "500000", denom: "uscrt" }],
        gas: "500000",
    },
    send: {
        amount: [{ amount: "80000", denom: "uscrt" }],
        gas: "80000",
    },
}

const client = new SigningCosmWasmClient(
    httpUrl,
    address,
    sign,
    txEncryptionSeed,
    customFees
);
```

Of the entire list of commission types, we are only interested in "exec".

We leave the gas size unchanged, but the commission can be reduced.





## 2) Create viewing key

Each contract stores keys in its memory that provide access to account data, such as balance and transfer history.

To save a single viewing_key on each device and not to generate and install a new key every time, 
the user can select the option to create a template key for each address using his private key.
This template key is called "Simple viewing key".
The user can also select the option to generate a key using the library's built-in create_viewing_key method.

A simple viewing key is created like this:
```js
const createPrivateKeyHash = privateKey => return crypto.createHash('sha256').update(privateKey).digest('hex');
const privateKeyHash = createPrivateKeyHash(privateKey)
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
}
```

The resulting viewing key should be checked for relevance, for this it is enough to request a secret balance
```js
// https://github.com/SecretFoundation/SNIPs/blob/master/SNIP-20.md#balance

const resp = await client.queryContractSmart(contractAddress, {
    balance: {
        key: viewingKey,
        address: walletAddress
    }
})
```

And if we received a response without an error, then the key is suitable, but if an error is received,
then we need to install this key by performing the "viewing key" installation transaction
```js
const client = new SigningCosmWasmClient(
    httpUrl,
    walletAddress,
    sign,
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
```

As mentioned earlier, the user can also generate the viewing key using the library method:
```js
const client = new SigningCosmWasmClient(httpUrl, walletAddress, sign, txEncryptionSeed, feeObj)
const resp = await client.execute(contractAddress, {
    create_viewing_key: {
    entropy
    }
})

const {
    create_viewing_key: { key: viewingKey }
} = JSON.parse(Buffer.from(resp.data).toString('utf-8'))

// https://github.com/SecretFoundation/SNIPs/blob/master/SNIP-20.md#setviewingkey
```

    





## 3) Send SNIP-20 tokens, add memo, set transaction commission

To send a secret token, a viewing key is not required, you just need to refer to the contract by telling whom how much to send
```js
// https://github.com/SecretFoundation/SNIPs/blob/master/SNIP-20.md#transfer

await client.execute(contractAddress, {
    transfer: 
    {
        owner,
        amount: '1000',
        recipient
    }
});
```

This operation is visible as an encrypted transaction of calling a contract in the public network, as well as when using the viewing key and requesting a secret list of transfers, it will be possible to see to whom and what amount was sent, but not the date of sending, so it becomes impossible to establish a connection between a public transaction and a secret record.

You can also add a memo to a public transaction, which will be visible only as a comment to an encrypted transaction.
```js
await client.execute(contractAddress, {
    transfer: 
    {
        owner,
        amount: '1000',
        recipient
    },
    'Memo'
});
```




## 4) View SNIP-20 transactions history

In the secret list of transactions, only who pays to whom is known, and the identifier by which the sorting can be performed.

This identifier has no external links and is presumably the serial number of the transfer in the contract.
```js
// https://github.com/SecretFoundation/SNIPs/blob/master/SNIP-20.md#transferhistory

const resp = await client.queryContractSmart(contractAddress, {
    transfer_history: {
        key: viewingKey,
        address: walletAddress,
        page_size: 10,
        page
    }
})
```





## 5) SCRT -> secretSCRT / secretSCRT  -> SCRT converter

To wrap SCRT there's a special method in a contract.
```js
// https://github.com/SecretFoundation/SNIPs/blob/master/SNIP-20.md#deposit
const convert = await client.execute(
    'secret1k0jntykt7e4g3y88ltc60czgjuqdy4c9e8fzek', // contract sSCRT
    {
        deposit: {
            padding: '6355a6f36bf44cc7'
        }
    },
    'Memo',
    // In this parameter, we indicate how many coins must be sent to the address of the contract along with its call
    [
        {
            denom: 'uscrt',
            amount: '1000000'
        }
    ]
);
```

To receive funds back, there is also a special contract method, with it is just enough to indicate what amount we want to return.
```js
// https://github.com/SecretFoundation/SNIPs/blob/master/SNIP-20.md#redeem
const convert = await client.execute(
    'secret1k0jntykt7e4g3y88ltc60czgjuqdy4c9e8fzek',
    {
        redeem: {
            amount: 1000000,
            padding: '1b31cef91c89a8ae'
        }
    }
);
```





## 6) ERC20/SNIP20 bridge

Bridge is a special contract. To interact with it user has to send the tokens to that contract.
An important nuance is the fact that each token has its own minimum sending limit.

The call is made to the token that we want to send through the bridge.
By sending coins as a recipient, we indicate the address of the contract that acts as a bridge from SN to Ethereum.
Also, so that the contract knows where to send the coins, we indicate the receiver's broadcast address in the "msg" field, having encoded the address in base64.
```js
const convert = await client.execute('contract address', {
    send: {
        amount, // the amount is indicated without fractions, i.e. you need to apply a divisor for a specific token
        recipient: 'secret1tmm5xxxe0ltg6df3q2d69dq770030a2syydc9u', // the address of the bridge from SN to Ethereum (for the ETH itself and erc20 tokens)
        msg: Buffer.from('0x2914c8...').toString('base64') // ethereum receiver address
    }
});
```



When sending coins from Ethereum to SN, a similar method of invoking a special bridge contract in SN is used.

And the first thing we need to do is connect the bridge contract itself and convert the recipient's secret address into hex format so that the contract can read it.
```js
const secretBridgeAddr = '0xf4b00c937b4ec4bb5ac051c3c719036c668a31ec';
const bridgeEthToSecret = new web3.eth.Contract(require('./SecretBridgeAbi.json').abi, secretBridgeAddr);
const secretAddrHex = web3.utils.fromAscii(to);
```

 Further, depending on whether we are sending the ether itself or the erc20 token, we decide which contract method should be called.
```js
const estimateGas = await bridgeEthToSecret.methods.swap(secretAddrHex).estimateGas({
    value,
    from
});

const gasLimit = BigNumber(estimateGas).multipliedBy(1.3).toFixed(0);
const gasPrice = await web3.eth.getGasPrice();
const chainId = await web3.eth.getChainId();
const nonce = await web3.eth.getTransactionCount(from, 'latest');

const build = await bridgeEthToSecret.methods.swap(secretAddrHex).send({
    value,
    from,
    gas: gasLimit,
    gasPrice,
    nonce,
    chainId
});
```

We also adhere to the method of pre-calculating the required amount of gas for a transaction, so as not to overestimate the required amount of commission.

When sending erc20 tokens, in addition to calling the bridge contract, we need to make the transaction to authorize the write-off of our token by the same contract.
```js
 // 1) Checking current permission

 const allowanceAmount = await erc20Contract.methods.allowance(from, secretSwapperAddr).call();

 // 2) If necessary, issue a permit for the required amount for the bridge contract

 await erc20Contract.methods.approve(secretBridgeAddr, web3.utils.toHex(amount)).send({
     from,
     gas: BigNumber(approveGas).times(1.3).toFixed(0),
     gasPrice: gasPrice,
     nonce,
     chainId
 });

 // 3) We call the token bridge method, at this moment the bridge will try to write off our tokens from the specified ERC20 contract

 await bridgeEthToSecret.methods.swapToken(web3.utils.fromAscii(to), web3.utils.toHex(amount), contractAddress).send({
     from,
     gas: sendGas,
     gasPrice,
     nonce,
     chainId
 });
 ```



After these transactions, the coins will be credited to the contract in Secret blockchain, but they will not be displayed in the history as a transfer.

The secret.js application contains the methods used to interact directly with the 'secretjs' library

Token data is stored in vuex storage, then using the vuex-persistedstate library, it is automatically stored in localStorage

The vuex storage code is listed in the snip20.js app
The code responsible for preparing bridge transactions is specified in the bridge.js application.
Excerpts from the logic of signing and sending bridge transactions


Executing bridge transaction
result variable contains operation results and if successful, then it will also contain transactioHash
```js
const result = await getConvertFunc(token.net, this.$snip20)(
    {
        walletAddress: coin.address,
        contractAddress: (snip20Token && snip20Token.address) || null,
        toAddress: sendTo,
        privateKey,
        amount,
        fee,
        walletType: type,
        userId,
        decimals: (snip20Token && snip20Token.decimals) || null,
        bridgeContract,
        ethDisapproveTx: getters[BRIDGE.GETTER.GET_DISAPPROVE_TX],
        ethApproveTx: getters[BRIDGE.GETTER.GET_APPROVE_TX],
        ethTransferTx: state.confirmData.rawUnsignedTransaction
    },
    {
        getSignFunc: this.$snip20.getSignFunc,
        dispatch,
        commit,
        getters
    }
)
```



Function that returns the function that is needed to execute the bridge
* $snip20 object that contains methods from secret.js app
```js
const getConvertFunc = (sourceNet, $snip20) => {
  const mapNetToFunc = {
    secret_: $snip20.convertScrtToEth,
    secret: $snip20.convertScrtToSecretScrt,
    secret_scrt: $snip20.convertSecretScrtToScrt,
    eth: convertEth,
    eth_: convertEthToken
  }
  let net = sourceNet
  if (getMainNet(sourceNet) === 'secret') {
    net = sourceNet !== 'secret' && sourceNet !== 'secret_scrt' ? 'secret_' : sourceNet
  }
  if (getMainNet(sourceNet) === 'eth') {
    net = net.includes('eth_') ? 'eth_' : sourceNet
  }

  return mapNetToFunc[net]
}
```


Functions that are used for the bridge on Ethereum side
```js
const convertEth = async (_, { dispatch }) => {
  const hash = await dispatch(SEND_COIN_OPERATION.ACTION.CONFIRM_OPERATION)
  return { error: false, convertResult: { transactionHash: hash } }
}
const convertEthToken = async ({ ethDisapproveTx, ethApproveTx, ethTransferTx }, { dispatch, commit }) => {
  if (ethDisapproveTx) {
    commit(SEND_COIN_OPERATION.MUTATION.SET_RAW_TRANSACTION, ethDisapproveTx)
    await dispatch(SEND_COIN_OPERATION.ACTION.CONFIRM_OPERATION, { isApproveTx: true })
  }

  // approve tx
  if (ethApproveTx) {
    commit(SEND_COIN_OPERATION.MUTATION.SET_RAW_TRANSACTION, ethApproveTx)
    await dispatch(SEND_COIN_OPERATION.ACTION.CONFIRM_OPERATION, { isApproveTx: true })
  }

  // convert tx
  commit(SEND_COIN_OPERATION.MUTATION.SET_RAW_TRANSACTION, ethTransferTx)
  const hash = await dispatch(SEND_COIN_OPERATION.ACTION.CONFIRM_OPERATION)
  return { error: false, convertResult: { transactionHash: hash } }
}
```
