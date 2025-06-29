const utils = require('./utils')
const ext = require('./bn-extensions')
const BN = require('bn.js')
// add inputs until we reach or surpass the target value (or deplete)
// worst-case: O(n)
function accumulative (utxos, inputs, outputs, feeRate, memoSize, blobSize, maxTxSize) {
  // Default max transaction size (conservative limit for most networks)
  maxTxSize = maxTxSize || 99000 // 99KB - leaving room for signatures and safety margin
  if (!utils.uintOrNull(feeRate)) return { error: 'INVALID_FEE_RATE' }

  const changeOutputBytes = utils.outputBytes({})
  let memoPadding = 0
  if (memoSize) {
    memoPadding = memoSize + 5 + 8 // opreturn overhead + memo size + amount int64
  }
  blobSize = blobSize || 0

  // Determine sweep strategy based on subtractFeeFrom distribution
  const subtractFeeCount = outputs.filter(o => o.subtractFeeFrom === true).length
  const totalOutputs = outputs.length

  // Use all inputs if:
  // 1. ALL outputs have subtractFeeFrom (true sweep), OR
  // 2. MAJORITY of outputs have subtractFeeFrom (sweep-like behavior)
  const shouldUseAllInputs = subtractFeeCount === totalOutputs ||
                            (subtractFeeCount > 0 && subtractFeeCount >= totalOutputs / 2)
  const hasSomeSubtractFee = subtractFeeCount > 0

  let feeBytes = new BN(changeOutputBytes.toNumber() + 4)
  let bytesAccum = utils.transactionBytes(inputs, outputs)
  let inAccum = utils.sumOrNaN(inputs)
  let outAccum = utils.sumOrNaN(outputs)

  // Check for invalid amounts early but continue to calculate proper fee
  const hasInvalidAmounts = !inAccum || !outAccum

  let fee = ext.mul(feeRate, bytesAccum)
  const memBytes = new BN(memoPadding)
  let blobBytes = new BN(blobSize)
  // factor blobs by 100x in fee market
  blobBytes = ext.mul(blobBytes, new BN(0.01))
  bytesAccum = ext.add(bytesAccum, memBytes)
  feeBytes = ext.add(feeBytes, memBytes)
  feeBytes = ext.add(feeBytes, blobBytes)
  const dustAmount = utils.dustThreshold({ type: 'BECH32' }, feeRate)

  if (blobSize) {
    outAccum = ext.add(outAccum, dustAmount)
    bytesAccum = ext.add(bytesAccum, changeOutputBytes)
    feeBytes = ext.add(feeBytes, changeOutputBytes)
    // double up to be safe
    bytesAccum = ext.add(bytesAccum, changeOutputBytes)
    feeBytes = ext.add(feeBytes, changeOutputBytes)
  }

  // is already enough input?
  if (!hasInvalidAmounts && !shouldUseAllInputs && ext.gte(inAccum, ext.add(outAccum, fee))) {
    return utils.finalize(inputs, outputs, feeRate, feeBytes)
  }

  for (let i = 0; i < utxos.length; i++) {
    const utxo = utxos[i]
    const utxoBytes = utils.inputBytes(utxo)
    const utxoFee = ext.mul(feeRate, utxoBytes)
    const utxoValue = utils.uintOrNull(utxo.value)

    // skip detrimental input
    if (ext.gt(utxoFee, utxoValue)) {
      // Don't skip detrimental UTXOs in sweep mode (subtractFeeFrom)
      // In sweep mode, fees are deducted from output value, so individual UTXO profitability doesn't matter
      if (shouldUseAllInputs || hasSomeSubtractFee) {
        // Add the UTXO even if it's detrimental in sweep mode
        bytesAccum = ext.add(bytesAccum, utxoBytes)

        // Check transaction size limit
        if (bytesAccum.gt(new BN(maxTxSize))) {
          return utils.finalize(inputs, outputs, feeRate, feeBytes)
        }

        inAccum = ext.add(inAccum, utxoValue)
        inputs.push(utxo)

        // Continue to next UTXO
        continue
      }

      // Original logic: skip detrimental UTXOs in normal mode
      if (i === utxos.length - 1) {
        const calculatedFee = ext.mul(feeRate, ext.add(bytesAccum, utxoBytes))
        const totalRequired = ext.add(outAccum, calculatedFee)
        const shortfall = ext.sub(totalRequired, inAccum)
        return {
          error: 'INSUFFICIENT_FUNDS',
          fee: calculatedFee,
          shortfall,
          details: {
            inputTotal: inAccum,
            outputTotal: outAccum,
            requiredFee: calculatedFee,
            message: 'Last UTXO costs more in fees than its value'
          }
        }
      }
      continue
    }

    bytesAccum = ext.add(bytesAccum, utxoBytes)

    // Check if adding this input would exceed transaction size limit
    if (bytesAccum.gt(new BN(maxTxSize))) {
      // Don't add this input, use what we have so far
      if ((shouldUseAllInputs || hasSomeSubtractFee) && inputs.length > 0) {
        // For sweep or subtractFeeFrom, use current inputs even if we hit size limit
        return utils.finalize(inputs, outputs, feeRate, feeBytes)
      }
      // For normal transactions, this means we can't fit enough inputs
      break
    }

    inAccum = ext.add(inAccum, utxoValue)
    inputs.push(utxo)

    // if this is an asset input, we will need another output to send asset to so add dust satoshi to output and add output fee
    if (utxo.assetInfo) {
      outAccum = ext.add(outAccum, dustAmount)
      bytesAccum = ext.add(bytesAccum, changeOutputBytes)
      feeBytes = ext.add(feeBytes, changeOutputBytes)
      // double up to be safe
      bytesAccum = ext.add(bytesAccum, changeOutputBytes)
      feeBytes = ext.add(feeBytes, changeOutputBytes)
      // add another bech32 output for OP_RETURN overhead
      // any extra data should be optimized out later as OP_RETURN is serialized and fees are optimized
      bytesAccum = ext.add(bytesAccum, changeOutputBytes)
      feeBytes = ext.add(feeBytes, changeOutputBytes)
    }

    fee = ext.mul(feeRate, bytesAccum)

    // go again?
    if (!shouldUseAllInputs && ext.lt(inAccum, ext.add(outAccum, fee))) {
      continue
    }
    // For sweep operations, continue collecting ALL inputs (respecting size limits)
    if (shouldUseAllInputs) {
      continue
    }

    // Don't call finalize if we have invalid amounts
    if (hasInvalidAmounts) {
      break
    }

    return utils.finalize(inputs, outputs, feeRate, feeBytes)
  }

  // If sweep is specified and we've gone through all utxos,
  // use all inputs collected
  if (!hasInvalidAmounts && shouldUseAllInputs && inputs.length > 0) {
    return utils.finalize(inputs, outputs, feeRate, feeBytes)
  }

  const calculatedFee = ext.mul(feeRate, bytesAccum)

  // Check if we failed due to invalid amounts
  if (!inAccum || !outAccum) {
    return {
      fee: calculatedFee,
      error: 'INVALID_AMOUNT'
    }
  }

  return {
    fee: calculatedFee,
    error: 'INSUFFICIENT_FUNDS',
    shortfall: ext.sub(ext.add(outAccum, calculatedFee), inAccum),
    details: {
      inputTotal: inAccum,
      outputTotal: outAccum,
      requiredFee: calculatedFee,
      message: 'Not enough UTXOs to cover amount and fees'
    }
  }
}

// worst-case: O(n)
function accumulativeAsset (utxoAssets, assetMap, feeRate, txVersion) {
  if (!utils.uintOrNull(feeRate)) return { error: 'INVALID_FEE_RATE' }
  const dustAmount = utils.dustThreshold({ type: 'BECH32' }, feeRate)
  const isNonAssetFunded = utils.isNonAssetFunded(txVersion)
  const assetAllocations = []
  const outputs = []
  const inputs = []
  // loop through all assets looking to get funded, sort the utxo's and then try to fund them incrementally
  for (const [assetGuid, valueAssetObj] of assetMap.entries()) {
    const assetAllocation = { assetGuid, values: [] }

    valueAssetObj.outputs.forEach(output => {
      assetAllocation.values.push({ n: outputs.length, value: output.value })
      if (output.address === valueAssetObj.changeAddress) {
        // add change index
        outputs.push({ assetChangeIndex: assetAllocation.values.length - 1, type: 'BECH32', assetInfo: { assetGuid, value: output.value }, value: dustAmount })
      } else {
        outputs.push({ address: output.address, type: 'BECH32', assetInfo: { assetGuid, value: output.value }, value: dustAmount })
      }
    })
    // order by descending asset amounts for this asset guid
    let utxoAsset = utxoAssets.filter(utxo => utxo.assetInfo.assetGuid === assetGuid)
    utxoAsset = utxoAsset.concat().sort(function (a, b) {
      return ext.sub(b.assetInfo.value, a.assetInfo.value)
    })

    if (!isNonAssetFunded) {
      const assetOutAccum = utils.sumOrNaN(valueAssetObj.outputs)
      // order by descending asset amounts for this asset guid
      let utxoAsset = utxoAssets.filter(utxo => utxo.assetInfo.assetGuid === assetGuid)
      utxoAsset = utxoAsset.concat().sort(function (a, b) {
        return ext.sub(b.assetInfo.value, a.assetInfo.value)
      })
      let inAccum = ext.BN_ZERO
      for (let i = 0; i < utxoAsset.length; i++) {
        const utxo = utxoAsset[i]
        const utxoValue = utils.uintOrNull(utxo.assetInfo.value)
        inAccum = ext.add(inAccum, utxoValue)
        inputs.push(utxo)
        // deal with change
        if (ext.gt(inAccum, assetOutAccum)) {
          const changeAsset = ext.sub(inAccum, assetOutAccum)
          // add output as dust amount (smallest possible sys output)
          const output = { assetChangeIndex: assetAllocation.values.length, type: 'BECH32', assetInfo: { assetGuid, value: changeAsset }, value: dustAmount }
          // but asset commitment will have the full asset change value
          assetAllocation.values.push({ n: outputs.length, value: changeAsset })
          outputs.push(output)
          break
        // no change, in = out
        } else if (ext.eq(inAccum, assetOutAccum)) {
          break
        }
      }
    }
    assetAllocations.push(assetAllocation)
  }
  return utils.finalizeAssets(inputs, outputs, assetAllocations)
}

module.exports = {
  accumulative,
  accumulativeAsset
}
