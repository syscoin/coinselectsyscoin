const utils = require('./utils')
const BN = require('bn.js')
const ext = require('./bn-extensions')

// split utxos between each output, ignores outputs with .value defined
module.exports = function split (utxos, outputs, feeRate, options) {
  if (!utils.uintOrNull(feeRate)) return { error: 'INVALID_FEE_RATE' }
  const invalid = utils.validateDustOutputs(outputs, options)
  if (invalid) return invalid
  const changeOutputBytes = utils.outputBytes({})
  const bytesAccum = utils.transactionBytes(utxos, outputs)
  const fee = ext.mul(feeRate, bytesAccum)
  if (outputs.length === 0) {
    return {
      error: 'INSUFFICIENT_FUNDS',
      fee,
      shortfall: ext.BN_ZERO,
      details: {
        inputTotal: ext.BN_ZERO,
        outputTotal: ext.BN_ZERO,
        requiredFee: fee,
        message: 'No outputs specified'
      }
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
    const totalRequired = ext.add(outAccum, fee)
    const shortfall = ext.sub(totalRequired, inAccum)
    return {
      error: 'INSUFFICIENT_FUNDS',
      fee,
      shortfall,
      details: {
        inputTotal: inAccum,
        outputTotal: outAccum,
        requiredFee: fee,
        message: 'Insufficient funds for outputs and fees'
      }
    }
  }

  const unspecified = outputs.reduce(function (a, x) {
    return a + !x.value
  }, 0)

  if (ext.isZero(remaining) && unspecified === 0) return utils.finalize(utxos, outputs, feeRate, changeOutputBytes, undefined, options)

  // Counts the number of split outputs left
  const splitOutputsCount = new BN(outputs.reduce(function (a, x) {
    return a + !x.value
  }, 0))

  // any number / 0 = infinity (shift right = 0)
  const splitValue = ext.div(remaining, splitOutputsCount)

  // ensure every output is either user defined, or over the threshold
  if (!outputs.every(function (x) {
    return x.value !== undefined || ext.gte(splitValue, utils.dustThreshold(x, feeRate, options))
  })) {
    // If we can't create any outputs due to insufficient funds after fees, report as insufficient funds
    const dustTotal = outputs.filter(x => x.value === undefined)
      .reduce((total, output) => total.add(utils.dustThreshold(output, feeRate, options)), ext.BN_ZERO)
    const totalRequired = ext.add(outAccum, fee, dustTotal)
    if (ext.lt(inAccum, totalRequired)) {
      const shortfall = ext.sub(totalRequired, inAccum)
      return {
        error: 'INSUFFICIENT_FUNDS',
        fee,
        shortfall,
        details: {
          inputTotal: inAccum,
          outputTotal: outAccum,
          requiredFee: fee,
          message: 'Insufficient funds to create dust-free outputs'
        }
      }
    }
    return {
      fee,
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

  return utils.finalize(utxos, outputs, feeRate, changeOutputBytes, undefined, options)
}
