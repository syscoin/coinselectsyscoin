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
      shortfall: shortfall,
      details: {
        inputTotal: inputTotal,
        outputTotal: outputTotal,
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
    let fee = ext.mul(feeRate, bytesAccum)
    const outputsCopy = outputs.slice()
    let remainingFee = fee
    const outputsToRemove = []

    // Subtract fees from marked outputs in order
    for (const { output, index } of subtractFeeOutputs) {
      const outputValue = output.value
      let deduction = ext.BN_ZERO
      const dust = dustThreshold(output, feeRate)

      if (!remainingFee.isZero()) {
        const maxDeduction = outputValue.sub(dust)

        if (!maxDeduction.isNeg() && !maxDeduction.isZero()) {
          deduction = remainingFee.lt(maxDeduction) ? remainingFee : maxDeduction
          remainingFee = remainingFee.sub(deduction)
        }
      }

      const newValue = outputValue.sub(deduction)

      // If the output value after deduction is at or below dust threshold, mark it for removal
      if (newValue.lte(dust)) {
        outputsToRemove.push(index)
        // If we're removing this output, the full value is effectively deducted
        remainingFee = remainingFee.sub(outputValue.sub(deduction))
      } else {
        outputsCopy[index] = Object.assign({}, output, {
          value: newValue
        })
        delete outputsCopy[index].subtractFeeFrom
      }
    }

    // Remove outputs marked for removal (in reverse order to maintain indices)
    for (let i = outputsToRemove.length - 1; i >= 0; i--) {
      outputsCopy.splice(outputsToRemove[i], 1)
    }

    // If we removed outputs, recalculate the fee with the new transaction size
    if (outputsToRemove.length > 0) {
      const newBytesAccum = transactionBytes(inputs, outputsCopy)
      fee = ext.mul(feeRate, newBytesAccum)
    }

    // If we couldn't subtract all fees, return error
    if (!remainingFee.isZero()) {
      return {
        error: 'SUBTRACT_FEE_FAILED',
        fee: fee,
        remainingFee: remainingFee,
        details: {
          markedOutputs: subtractFeeOutputs.length,
          removedOutputs: outputsToRemove.length
        }
      }
    }

    return {
      inputs: inputs,
      outputs: outputsCopy,
      fee: fee
    }
  }

  // Normal case: add change output if needed
  if (ext.gt(remainderAfterExtraOutput, dustThreshold({}, feeRate))) {
    outputs = outputs.concat({ changeIndex: outputs.length, value: remainderAfterExtraOutput })
  }

  const fee = ext.sub(inputTotal, sumOrNaN(outputs, txVersion))
  if (!fee) {
    const calculatedFee = ext.mul(feeRate, bytesAccum)
    const shortfall = ext.sub(ext.add(outputTotal, calculatedFee), inputTotal)
    return {
      error: 'INSUFFICIENT_FUNDS',
      fee: calculatedFee,
      shortfall: shortfall,
      details: {
        inputTotal: inputTotal,
        outputTotal: outputTotal,
        requiredFee: calculatedFee
      }
    }
  }

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
