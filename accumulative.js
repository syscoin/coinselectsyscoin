var utils = require('./utils')
var ext = require('./bn-extensions')

// add inputs until we reach or surpass the target value (or deplete)
// worst-case: O(n)
function accumulative (utxos, inputs, outputs, feeRate) {
  if (!utils.uintOrNull(feeRate)) return {}
  var bytesAccum = utils.transactionBytes(inputs, outputs)
  var inAccum = utils.sumOrNaN(inputs)
  var outAccum = utils.sumOrNaN(outputs)
  var fee = ext.mul(feeRate, bytesAccum)

  // is already enough input?
  if (ext.gte(inAccum, ext.add(outAccum, fee))) return utils.finalize(inputs, outputs, feeRate)

  for (var i = 0; i < utxos.length; i++) {
    var utxo = utxos[i]
    var utxoBytes = utils.inputBytes(utxo)
    var utxoFee = ext.mul(feeRate, utxoBytes)
    var utxoValue = utils.uintOrNull(utxo.value)

    // skip detrimental input
    if (ext.gt(utxoFee, utxoValue)) {
      if (i === utxos.length - 1) {
        return { fee: ext.mul(feeRate, ext.add(bytesAccum, utxoBytes)) }
      }
      continue
    }

    bytesAccum = ext.add(bytesAccum, utxoBytes)
    inAccum = ext.add(inAccum, utxoValue)
    inputs.push(utxo)

    fee = ext.mul(feeRate, bytesAccum)

    // go again?
    if (ext.lt(inAccum, ext.add(outAccum, fee))) continue

    return utils.finalize(inputs, outputs, feeRate)
  }

  return { fee: ext.mul(feeRate, bytesAccum) }
}

// worst-case: O(n)
function accumulativeAsset (utxoAssets, assetMap, feeRate, isNonAssetFunded) {
  const dustAmount = utils.dustThreshold({ type: 'BECH32' }, feeRate)
  const assetAllocations = []
  const outputs = []
  const inputs = []
  // loop through all assets looking to get funded, sort the utxo's and then try to fund them incrementally
  for (const [assetGuid, valueAssetObj] of assetMap.entries()) {
    let assetAllocation = assetAllocations[assetGuid]
    if (!assetAllocation || assetAllocation.length === 0) {
      assetAllocation = []
    }

    valueAssetObj.outputs.forEach(output => {
      assetAllocation.push({ n: outputs.length, value: output.value })
      outputs.push({ address: output.address, type: 'BECH32', assetInfo: { assetGuid: assetGuid, value: output.value }, value: dustAmount })
    })

    // if not expecting asset to be funded, we just want outputs then return here without inputs
    if (isNonAssetFunded) {
      return utils.finalizeAssets(inputs, outputs, assetAllocations)
    }

    const assetOutAccum = utils.sumOrNaN(valueAssetObj.outputs)
    // order by descending asset amounts for this asset guid
    let utxoAsset = utxoAssets.filter(utxo => utxo.assetInfo.assetGuid === assetGuid)
    utxoAsset = utxoAsset.concat().sort(function (a, b) {
      return ext.sub(b.assetInfo.value, a.assetInfo.value)
    })
    let inAccum = ext.BN_ZERO
    let funded = false
    for (var i = 0; i < utxoAsset.length; i++) {
      const utxo = utxoAsset[i]
      const utxoValue = utils.uintOrNull(utxo.assetInfo.value)
      inAccum = ext.add(inAccum, utxoValue)
      inputs.push(utxo)
      // deal with change
      if (ext.gt(inAccum, assetOutAccum)) {
        const changeAsset = ext.sub(inAccum, assetOutAccum)
        // add output as dust amount (smallest possible sys output)
        const output = { type: 'BECH32', assetInfo: { assetGuid: assetGuid, value: changeAsset }, value: dustAmount }
        // but asset commitment will have the full asset change value
        assetAllocation.push({ n: outputs.length, value: changeAsset })
        outputs.push(output)
        funded = true
        break
      // no change, in = out
      } else if (ext.eq(inAccum, assetOutAccum)) {
        funded = true
        break
      }
    }
    // shortcut when we know an asset spend is not funded
    if (!funded) {
      return utils.finalizeAssets(null, null, null, null, null)
    }
  }
  return utils.finalizeAssets(inputs, outputs, assetAllocations)
}

module.exports = {
  accumulative: accumulative,
  accumulativeAsset: accumulativeAsset
}
