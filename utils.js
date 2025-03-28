const BN = require('bn.js')
const ext = require('./bn-extensions')
const SYSCOIN_TX_VERSION_SYSCOIN_BURN_TO_ALLOCATION = 139
const SYSCOIN_TX_VERSION_ALLOCATION_MINT = 140
function isNonAssetFunded (txVersion) {
  return txVersion === SYSCOIN_TX_VERSION_SYSCOIN_BURN_TO_ALLOCATION || txVersion === SYSCOIN_TX_VERSION_ALLOCATION_MINT
}
// baseline estimates, used to improve performance
const TX_BASE_SIZE = new BN(11)

const TX_INPUT_SIZE = {
  LEGACY: new BN(147),
  P2SH: new BN(91),
  BECH32: new BN(68)
}

const TX_OUTPUT_SIZE = {
  LEGACY: new BN(34),
  P2SH: new BN(32),
  BECH32: new BN(31)
}

function inputBytes (input) {
  return TX_INPUT_SIZE[input.type] || TX_INPUT_SIZE.LEGACY
}

function outputBytes (output) {
  if (output.script) {
    return new BN(output.script.length + 5 + 8) // 5 for OP_PUSHDATA2 max OP_RETURN prefix, 8 for amount
  }
  return TX_OUTPUT_SIZE[output.type] || TX_OUTPUT_SIZE.LEGACY
}

function dustThreshold (output, feeRate) {
  /* ... classify the output for input estimate  */
  return ext.mul(inputBytes(output), feeRate)
}

function transactionBytes (inputs, outputs) {
  return TX_BASE_SIZE
    .add(inputs.reduce(function (a, x) {
      return ext.add(a, inputBytes(x))
    }, ext.BN_ZERO))
    .add(outputs.reduce(function (a, x) {
      return ext.add(a, outputBytes(x))
    }, ext.BN_ZERO))
}

function uintOrNull (v) {
  if (!BN.isBN(v)) return null
  if (v.isNeg()) return null
  return v
}

function sumForgiving (range) {
  return range.reduce(function (a, x) {
    const valueOrZero = BN.isBN(x.value) ? x.value : ext.BN_ZERO
    return ext.add(a, valueOrZero)
  },
  ext.BN_ZERO)
}

function sumOrNaN (range) {
  return range.reduce(function (a, x) {
    const value = x.value
    return ext.add(a, uintOrNull(value))
  }, ext.BN_ZERO)
}

function finalize (inputs, outputs, feeRate, feeBytes, txVersion) {
  const bytesAccum = transactionBytes(inputs, outputs)
  const feeAfterExtraOutput = ext.mul(feeRate, ext.add(bytesAccum, feeBytes))
  const remainderAfterExtraOutput = ext.sub(sumOrNaN(inputs), ext.add(sumOrNaN(outputs, txVersion), feeAfterExtraOutput))

  // is it worth a change output?
  if (ext.gt(remainderAfterExtraOutput, dustThreshold({}, feeRate))) {
    outputs = outputs.concat({ changeIndex: outputs.length, value: remainderAfterExtraOutput })
  }

  const fee = ext.sub(sumOrNaN(inputs), sumOrNaN(outputs, txVersion))
  if (!fee) return { fee: ext.mul(feeRate, bytesAccum) }

  return {
    inputs: inputs,
    outputs: outputs,
    fee: fee
  }
}

function finalizeAssets (inputs, outputs, assetAllocations) {
  if (!inputs || !outputs || !assetAllocations) {
    return {
      inputs: null,
      outputs: null,
      assetAllocations: null
    }
  }
  return {
    inputs: inputs,
    outputs: outputs,
    assetAllocations: assetAllocations
  }
}

module.exports = {
  dustThreshold: dustThreshold,
  finalize: finalize,
  finalizeAssets: finalizeAssets,
  inputBytes: inputBytes,
  outputBytes: outputBytes,
  sumOrNaN: sumOrNaN,
  sumForgiving: sumForgiving,
  transactionBytes: transactionBytes,
  uintOrNull: uintOrNull,
  isNonAssetFunded: isNonAssetFunded
}
