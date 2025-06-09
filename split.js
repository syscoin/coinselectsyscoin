const utils = require('./utils')
const BN = require('bn.js')
const ext = require('./bn-extensions')

// split utxos between each output, ignores outputs with .value defined
module.exports = function split (utxos, outputs, feeRate) {
  if (!utils.uintOrNull(feeRate)) return { error: 'INVALID_FEE_RATE' }
  const changeOutputBytes = utils.outputBytes({})
  const bytesAccum = utils.transactionBytes(utxos, outputs)
  const fee = ext.mul(feeRate, bytesAccum)
  if (outputs.length === 0) {
    return {
      fee: fee,
      error: 'INSUFFICIENT_FUNDS'
    }
  }

  const inAccum = utils.sumOrNaN(utxos)

  // Check for invalid input amounts
  if (!inAccum) {
    return {
      fee: fee || ext.BN_ZERO,
      error: 'INVALID_AMOUNT'
    }
  }

  // Check for invalid output values
  const hasInvalidOutput = outputs.some(function (output) {
    return output.value !== undefined && !utils.uintOrNull(output.value)
  })

  if (hasInvalidOutput) {
    return {
      fee: fee || ext.BN_ZERO,
      error: 'INVALID_AMOUNT'
    }
  }

  const outAccum = utils.sumForgiving(outputs)
  const remaining = ext.sub(inAccum, outAccum, fee)
  if (!remaining || remaining < 0) {
    return {
      fee: fee,
      error: 'INSUFFICIENT_FUNDS'
    }
  }

  const unspecified = outputs.reduce(function (a, x) {
    return a + !x.value
  }, 0)

  if (ext.isZero(remaining) && unspecified === 0) return utils.finalize(utxos, outputs, feeRate, changeOutputBytes)

  // Counts the number of split outputs left
  const splitOutputsCount = new BN(outputs.reduce(function (a, x) {
    return a + !x.value
  }, 0))

  // any number / 0 = infinity (shift right = 0)
  const splitValue = ext.div(remaining, splitOutputsCount)

  // ensure every output is either user defined, or over the threshold
  if (!outputs.every(function (x) {
    return x.value !== undefined || ext.gt(splitValue, utils.dustThreshold(x, feeRate))
  })) {
    // If we can't create any outputs due to insufficient funds after fees, report as insufficient funds
    const totalRequired = ext.add(fee, ext.mul(utils.dustThreshold({}, feeRate), splitOutputsCount))
    if (ext.lt(inAccum, totalRequired)) {
      return {
        fee: fee,
        error: 'INSUFFICIENT_FUNDS'
      }
    }
    return {
      fee: fee,
      error: 'OUTPUT_TOO_SMALL'
    }
  }

  // assign splitValue to outputs not user defined
  outputs = outputs.map(function (x) {
    if (x.value !== undefined) return x

    // not user defined, but still copy over any non-value fields
    const y = {}
    for (const k in x) y[k] = x[k]
    y.value = splitValue
    return y
  })

  return utils.finalize(utxos, outputs, feeRate, changeOutputBytes)
}
