var BN = require('bn.js')
var ext = require('./bn-extensions')
const SYSCOIN_TX_VERSION_ALLOCATION_BURN_TO_SYSCOIN = 128
const SYSCOIN_TX_VERSION_SYSCOIN_BURN_TO_ALLOCATION = 129
const SYSCOIN_TX_VERSION_ASSET_ACTIVATE = 130
const SYSCOIN_TX_VERSION_ASSET_UPDATE = 131
const SYSCOIN_TX_VERSION_ASSET_SEND = 132
const SYSCOIN_TX_VERSION_ALLOCATION_MINT = 133
const SYSCOIN_TX_VERSION_ALLOCATION_BURN_TO_ETHEREUM = 134
const SYSCOIN_TX_VERSION_ALLOCATION_SEND = 135
function isNonAssetFunded (txVersion) {
  return txVersion === SYSCOIN_TX_VERSION_ASSET_ACTIVATE || txVersion === SYSCOIN_TX_VERSION_SYSCOIN_BURN_TO_ALLOCATION || txVersion === SYSCOIN_TX_VERSION_ALLOCATION_MINT
}
function isAsset (txVersion) {
  return txVersion === SYSCOIN_TX_VERSION_ASSET_ACTIVATE || txVersion === SYSCOIN_TX_VERSION_ASSET_UPDATE || txVersion === SYSCOIN_TX_VERSION_ASSET_SEND
}
function isAllocationBurn (txVersion) {
  return txVersion === SYSCOIN_TX_VERSION_ALLOCATION_BURN_TO_SYSCOIN || txVersion === SYSCOIN_TX_VERSION_ALLOCATION_BURN_TO_ETHEREUM
}
// baseline estimates, used to improve performance
var TX_BASE_SIZE = new BN(10)

var TX_INPUT_SIZE = {
  LEGACY: new BN(148),
  P2SH: new BN(92),
  BECH32: new BN(69)
}

var TX_OUTPUT_SIZE = {
  LEGACY: new BN(34),
  P2SH: new BN(32),
  BECH32: new BN(31)
}

function inputBytes (input) {
  return TX_INPUT_SIZE[input.type] || TX_INPUT_SIZE.LEGACY
}

function outputBytes (output) {
  if (output.script) {
    return new BN(output.script.length)
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
    var valueOrZero = BN.isBN(x.value) ? x.value : ext.BN_ZERO
    return ext.add(a, valueOrZero)
  },
  ext.BN_ZERO)
}

function sumOrNaN (range) {
  return range.reduce(function (a, x) {
    return ext.add(a, uintOrNull(x.value))
  }, ext.BN_ZERO)
}

function finalize (inputs, outputs, feeRate, feeBytes) {
  var bytesAccum = transactionBytes(inputs, outputs)
  var feeAfterExtraOutput = ext.mul(feeRate, ext.add(bytesAccum, feeBytes))
  var remainderAfterExtraOutput = ext.sub(sumOrNaN(inputs), ext.add(sumOrNaN(outputs), feeAfterExtraOutput))

  // is it worth a change output?
  if (ext.gt(remainderAfterExtraOutput, dustThreshold({}, feeRate))) {
    outputs = outputs.concat({ changeIndex: outputs.length, value: remainderAfterExtraOutput })
  }

  var fee = ext.sub(sumOrNaN(inputs), sumOrNaN(outputs))
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

function getAuxFee (auxfeedetails, nAmount) {
  let nAccumulatedFee = 0
  let nBoundAmount = 0
  let nNextBoundAmount = 0
  let nRate = 0
  for (let i = 0; i < auxfeedetails.auxfees.length; i++) {
    const fee = auxfeedetails.auxfees[i]
    const feeNext = auxfeedetails.auxfees[i < auxfeedetails.auxfees.length - 1 ? i + 1 : i]
    nBoundAmount = fee.bound
    nNextBoundAmount = feeNext.bound

    // max uint16 (65535 = 0.65535 = 65.5535%)
    nRate = fee.percent / 100000.0
    // case where amount is in between the bounds
    if (nAmount >= nBoundAmount && nAmount < nNextBoundAmount) {
      break
    }
    nBoundAmount = nNextBoundAmount - nBoundAmount
    // must be last bound
    if (nBoundAmount <= 0) {
      return new BN((nAmount - nNextBoundAmount) * nRate + nAccumulatedFee)
    }
    nAccumulatedFee += (nBoundAmount * nRate)
  }
  return new BN((nAmount - nBoundAmount) * nRate + nAccumulatedFee)
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
  getAuxFee: getAuxFee,
  SYSCOIN_TX_VERSION_ALLOCATION_BURN_TO_SYSCOIN: SYSCOIN_TX_VERSION_ALLOCATION_BURN_TO_SYSCOIN,
  SYSCOIN_TX_VERSION_SYSCOIN_BURN_TO_ALLOCATION: SYSCOIN_TX_VERSION_SYSCOIN_BURN_TO_ALLOCATION,
  SYSCOIN_TX_VERSION_ASSET_ACTIVATE: SYSCOIN_TX_VERSION_ASSET_ACTIVATE,
  SYSCOIN_TX_VERSION_ASSET_UPDATE: SYSCOIN_TX_VERSION_ASSET_UPDATE,
  SYSCOIN_TX_VERSION_ASSET_SEND: SYSCOIN_TX_VERSION_ASSET_SEND,
  SYSCOIN_TX_VERSION_ALLOCATION_MINT: SYSCOIN_TX_VERSION_ALLOCATION_MINT,
  SYSCOIN_TX_VERSION_ALLOCATION_BURN_TO_ETHEREUM: SYSCOIN_TX_VERSION_ALLOCATION_BURN_TO_ETHEREUM,
  SYSCOIN_TX_VERSION_ALLOCATION_SEND: SYSCOIN_TX_VERSION_ALLOCATION_SEND,
  isNonAssetFunded: isNonAssetFunded,
  isAsset: isAsset,
  isAllocationBurn: isAllocationBurn

}
