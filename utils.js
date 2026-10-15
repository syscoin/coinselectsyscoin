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

function dustOptions (options) {
  if (options === undefined || options === null) options = {}
  if (typeof options !== 'object' || Array.isArray(options) ||
      Object.keys(options).some(key => key !== 'changeOutput' && key !== 'dustRelayFee')) {
    throw new TypeError('Invalid dust options')
  }
  const dustRelayFee = options.dustRelayFee === undefined ? new BN(3000) : options.dustRelayFee
  if (!BN.isBN(dustRelayFee) || dustRelayFee.isNeg()) throw new TypeError('Invalid dust relay fee')
  const changeOutput = options.changeOutput === undefined ? {} : options.changeOutput
  if (!changeOutput || typeof changeOutput !== 'object' || Array.isArray(changeOutput) ||
      Object.keys(changeOutput).some(key => key !== 'scriptPubKey') ||
      (changeOutput.scriptPubKey !== undefined && !(changeOutput.scriptPubKey instanceof Uint8Array))) {
    throw new TypeError('Invalid change output')
  }
  return { dustRelayFee, changeOutput }
}

function dustThreshold (output, feeRate, options) {
  // feeRate is retained for API compatibility; relay policy is independent.
  const policy = dustOptions(options)
  output = output || {}
  const rawScript = output.scriptPubKey
  let size
  if (rawScript !== undefined) {
    if (!(rawScript instanceof Uint8Array)) throw new TypeError('Invalid output script')
    const script = Buffer.from(rawScript)
    if (script[0] === 0x6a || script.length > 10000) return new BN(0)
    const witness = script.length >= 4 && script.length <= 42 &&
      (script[0] === 0 || (script[0] >= 0x51 && script[0] <= 0x60)) &&
      script[1] >= 2 && script[1] <= 40 && script[1] + 2 === script.length
    size = 8 + (script.length < 253 ? 1 : 3) + script.length + (witness ? 67 : 148)
  } else if (output.script !== undefined) {
    // The legacy API stores OP_RETURN data here, not the full locking script.
    if (!(output.script instanceof Uint8Array)) throw new TypeError('Invalid output script')
    return new BN(0)
  } else {
    const sizes = { LEGACY: 182, P2SH: 180, BECH32: 98, P2WPKH: 98, P2WSH: 110, P2TR: 110 }
    size = Object.prototype.hasOwnProperty.call(sizes, output.type) ? sizes[output.type] : sizes.LEGACY
  }
  // Core CFeeRate::GetFee rounds up, including non-integral custom relay rates.
  return policy.dustRelayFee.mul(new BN(size)).add(new BN(999)).div(new BN(1000))
}

function validateDustOutputs (outputs, options) {
  try {
    dustOptions(options)
    for (let i = 0; i < outputs.length; i++) {
      const output = outputs[i]
      const minimum = dustThreshold(output, undefined, options)
      if (uintOrNull(output.value) && output.subtractFeeFrom !== true && output.value.lt(minimum)) {
        return { error: 'DUST_OUTPUT', fee: ext.BN_ZERO, details: { outputIndex: i, minimum } }
      }
    }
  } catch (error) {
    return { error: error.message === 'Invalid output script' ? 'INVALID_OUTPUT_SCRIPT' : 'INVALID_DUST_OPTIONS' }
  }
  return null
}

function validateAssetScripts (assetMap, options) {
  const invalid = validateDustOutputs([], options)
  if (invalid) return invalid
  if (!assetMap) return null
  for (const asset of assetMap.values()) {
    if (asset.changeScript !== undefined && !(asset.changeScript instanceof Uint8Array)) return { error: 'INVALID_OUTPUT_SCRIPT' }
    for (const output of asset.outputs || []) {
      if (output.scriptPubKey !== undefined && !(output.scriptPubKey instanceof Uint8Array)) return { error: 'INVALID_OUTPUT_SCRIPT' }
    }
  }
  return null
}

function assetChangeOutput (asset, options) {
  const output = { type: 'BECH32' }
  const script = asset && asset.changeScript !== undefined
    ? asset.changeScript
    : dustOptions(options).changeOutput.scriptPubKey
  if (script !== undefined) output.scriptPubKey = script
  return output
}

function assetOutput (output, asset, assetGuid, value, allocationIndex, options) {
  const change = allocationIndex !== undefined
  const result = change ? assetChangeOutput(asset, options) : { type: 'BECH32', address: output.address }
  if (output.scriptPubKey !== undefined) result.scriptPubKey = output.scriptPubKey
  if (change) result.assetChangeIndex = allocationIndex
  result.assetInfo = { assetGuid, value }
  result.value = dustThreshold(result, undefined, options)
  return result
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

function finalize (inputs, outputs, feeRate, feeBytes, txVersion, options) {
  const invalid = validateDustOutputs(outputs, options)
  if (invalid) return invalid
  const bytesAccum = transactionBytes(inputs, outputs)
  const feeAfterExtraOutput = ext.mul(feeRate, ext.add(bytesAccum, feeBytes))
  const inputTotal = sumOrNaN(inputs)
  const outputTotal = sumOrNaN(outputs, txVersion)
  const remainderAfterExtraOutput = ext.sub(inputTotal, ext.add(outputTotal, feeAfterExtraOutput))

  // Fundamental validation: input must ALWAYS be >= output regardless of subtractFeeFrom
  // subtractFeeFrom can only reduce outputs, never create value from nothing
  if (inputTotal && outputTotal && inputTotal.lt(outputTotal)) {
    const shortfall = outputTotal.sub(inputTotal)
    return {
      error: 'INSUFFICIENT_FUNDS',
      fee: ext.BN_ZERO,
      shortfall,
      details: {
        inputTotal,
        outputTotal,
        requiredFee: ext.BN_ZERO,
        message: 'Input value is less than output value'
      }
    }
  }

  // Check if any outputs have subtractFeeFrom flag
  const subtractFeeOutputs = outputs.map((output, index) => ({ output, index }))
    .filter(item => item.output.subtractFeeFrom === true)

  if (subtractFeeOutputs.length > 0) {
    // Calculate fee without change output
    const fee = ext.mul(feeRate, bytesAccum)
    const outputsCopy = outputs.slice()
    let remainingFee = fee

    // Subtract fees from marked outputs in order
    for (const { output, index } of subtractFeeOutputs) {
      const outputValue = output.value
      let deduction = ext.BN_ZERO
      const dust = dustThreshold(output, feeRate, options)

      if (!remainingFee.isZero()) {
        const maxDeduction = outputValue.sub(dust)

        if (!maxDeduction.isNeg() && !maxDeduction.isZero()) {
          deduction = remainingFee.lt(maxDeduction) ? remainingFee : maxDeduction
          remainingFee = remainingFee.sub(deduction)
        }
      }

      const newValue = outputValue.sub(deduction)

      // Recipients are never discarded to make a fee-subtracted send fit.
      if (newValue.lt(dust)) {
        return { error: 'DUST_OUTPUT', fee, details: { outputIndex: index, minimum: dust } }
      } else {
        outputsCopy[index] = Object.assign({}, output, {
          value: newValue
        })
        delete outputsCopy[index].subtractFeeFrom
      }
    }

    // If we couldn't subtract all fees, return error
    if (!remainingFee.isZero()) {
      return {
        error: 'SUBTRACT_FEE_FAILED',
        fee,
        remainingFee,
        details: {
          markedOutputs: subtractFeeOutputs.length,
          removedOutputs: 0
        }
      }
    }

    return {
      inputs,
      outputs: outputsCopy,
      fee
    }
  }

  // Normal case: add change output if needed
  const changeOutput = dustOptions(options).changeOutput
  const changeDust = dustThreshold(changeOutput, feeRate, options)
  if (ext.gte(remainderAfterExtraOutput, changeDust)) {
    outputs = outputs.concat(Object.assign({}, changeOutput, { changeIndex: outputs.length, value: remainderAfterExtraOutput }))
  }

  const fee = ext.sub(inputTotal, sumOrNaN(outputs, txVersion))
  if (!fee) {
    const calculatedFee = ext.mul(feeRate, bytesAccum)
    const shortfall = ext.sub(ext.add(outputTotal, calculatedFee), inputTotal)
    return {
      error: 'INSUFFICIENT_FUNDS',
      fee: calculatedFee,
      shortfall,
      details: {
        inputTotal,
        outputTotal,
        requiredFee: calculatedFee,
        message: 'Insufficient funds after accounting for fees'
      }
    }
  }

  return {
    inputs,
    outputs,
    fee
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
    inputs,
    outputs,
    assetAllocations
  }
}

module.exports = {
  assetChangeOutput,
  assetOutput,
  dustOptions,
  dustThreshold,
  finalize,
  finalizeAssets,
  inputBytes,
  outputBytes,
  sumOrNaN,
  sumForgiving,
  transactionBytes,
  uintOrNull,
  validateAssetScripts,
  validateDustOutputs,
  isNonAssetFunded
}
