# coinselectsyscoin

[![TRAVIS](https://secure.travis-ci.org/bitcoinjs/coinselect.png)](http://travis-ci.org/syscoin/coinselect)
[![NPM](http://img.shields.io/npm/v/coinselect.svg)](https://www.npmjs.org/package/coinselect)

[![js-standard-style](https://cdn.rawgit.com/feross/standard/master/badge.svg)](https://github.com/feross/standard)

An unspent transaction output (UTXO) selection module for syscoin.

**WARNING:** Value units are in `satoshi`s, **not** Syscoin.


## Algorithms
Module | Algorithm | Re-orders UTXOs?
-|-|-
`require('coinselectsyscoin')` | Blackjack, with Accumulative fallback | By Descending Value
`require('coinselectsyscoin/accumulative')` | Accumulative - accumulates inputs until the target value (+fees) is reached, skipping detrimental inputs | -
`require('coinselectsyscoin/blackjack')` | Blackjack - accumulates inputs until the target value (+fees) is matched, does not accumulate inputs that go over the target value (within a threshold) | -
`require('coinselectsyscoin/break')` | Break - breaks the input values into equal denominations of `output` (as provided) | -
`require('coinselectsyscoin/split')` | Split - splits the input values evenly between all `outputs`, any provided `output` with `.value` remains unchanged | -


**Note:** Each algorithm will add a change output if the `input - output - fee` value difference is over a dust threshold.
This is calculated independently by `utils.finalize`, irrespective of the algorithm chosen, for the purposes of safety.

The shared default dust policy applies to native outputs and SPT carriers. It
uses Core's serialized-output-plus-spend-size rule at **3000 sat/kvB**, independent
of the chosen transaction fee rate. Actual Buffer/Uint8Array `output.scriptPubKey` metadata
is the authoritative full locking script. Without it, legacy `output.script` is
OP_RETURN data payload (zero dust floor regardless of its first byte), not a
spend locking script; otherwise the type hint is used. `scriptPubKey` does not
change the existing transaction-size estimator or replace the builder's data
`.script`. OP_RETURN/unspendable scripts have a zero dust threshold. Missing
script metadata falls back to LEGACY (546 sats); type hints support LEGACY,
P2SH (540), BECH32/P2WPKH (294), P2WSH and P2TR (330).

The optional final argument is data only, not a callback:

```javascript
const options = {
  changeOutput: { scriptPubKey: changeScriptBuffer },
  dustRelayFee: new BN(3000) // sat/kvB; optional, nonnegative BN
}
coinSelect.coinSelect(utxos, inputs, outputs, feeRate, txVersion, memoSize, blobSize, options)
coinSelect.coinSelectAsset(utxos, assetMap, feeRate, txVersion, options)
coinSelect.coinSelectAssetGas(allocations, utxos, inputs, outputs, feeRate, txVersion, assets, assetMap, memoSize, options)
```

Each assetMap value may provide `changeScript`; each recipient output may provide
`scriptPubKey`. Constructed SPT carriers preserve these scripts and use the same
relay-policy floor. `utils.dustThreshold(output, feeRate, options)` retains its
second argument for compatibility but ignores it for dust. `split` and `break`
accept options as their fourth argument. Equality with the threshold is allowed;
explicit recipients, including MAX recipients, are never discarded. Insufficient
MAX or dusty recipients return an error, and native change below its floor is
absorbed into the fee. Builders must still validate final scripts/amounts after
their own output transformations. This models Core's default policy, not an
assertion about an operator's custom relay settings.
Malformed recipient `scriptPubKey` or asset `changeScript` returns a structured
`INVALID_OUTPUT_SCRIPT` before asset selection or allocation synchronization.

**Pro-tip:** if you want to send-all inputs to an output address, `coinselectsyscoin/split` with a partial output (`.address` defined, no `.value`) can be used to send-all, while leaving an appropriate amount for the `fee`. 

## Example

``` javascript
let coinSelect = require('coinselectsyscoin')
let feeRate = 55 // satoshis per byte
let utxos = [
  ...,
  {
    txId: '...',
    vout: 0,
    ...,
    value: 10000,
    // For use with PSBT:
    // not needed for coinSelect, but will be passed on to inputs later
    nonWitnessUtxo: Buffer.from('...full raw hex of txId tx...', 'hex'),
    // OR
    // if your utxo is a segwit output, you can use witnessUtxo instead
    witnessUtxo: {
      script: Buffer.from('... scriptPubkey hex...', 'hex'),
      value: 10000 // 0.0001 BTC and is the exact same as the value above
    }
  }
]
let targets = [
  ...,
  {
    address: '1EHNa6Q4Jz2uvNExL497mE43ikXhwF6kZm',
    value: 5000
  }
]

// ...
let { inputs, outputs, fee } = coinSelect(utxos, targets, feeRate)

// the accumulated fee is always returned for analysis
console.log(fee)

// .inputs and .outputs will be undefined if no solution was found
if (!inputs || !outputs) return

let psbt = new bitcoin.Psbt()

inputs.forEach(input =>
  psbt.addInput({
    hash: input.txId,
    index: input.vout,
    nonWitnessUtxo: input.nonWitnessUtxo,
    // OR (not both)
    witnessUtxo: input.witnessUtxo,
  })
)
outputs.forEach(output => {
  // watch out, outputs may have been added that you need to provide
  // an output address/script for
  if (!output.address) {
    output.address = wallet.getChangeAddress()
    wallet.nextChangeAddress()
  }

  psbt.addOutput({
    address: output.address,
    value: output.value,
  })
})
```


## License [MIT](LICENSE)
