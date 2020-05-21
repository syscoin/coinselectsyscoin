var utils = require('./utils')
var ext = require('./bn-extensions')

// only add inputs if they don't bust the target value (aka, exact match)
// worst-case: O(n)
function blackjack (utxos, inputs, outputs, feeRate) {
  if (!utils.uintOrNull(feeRate)) return {}

  var bytesAccum = utils.transactionBytes(inputs, outputs)
  var inAccum = utils.sumOrNaN(inputs)
  var outAccum = utils.sumOrNaN(outputs)
  var fee = ext.mul(feeRate, bytesAccum)

  // is already enough input?
  if (ext.gte(inAccum, ext.add(outAccum, fee))) return utils.finalize(inputs, outputs, feeRate)

  var threshold = utils.dustThreshold({}, feeRate)

  for (var i = 0; i < utxos.length; i++) {
    var input = utxos[i]
    var inputBytes = utils.inputBytes(input)
    fee = ext.mul(feeRate, ext.add(bytesAccum, inputBytes))
    var inputValue = utils.uintOrNull(input.value)

    // would it waste value?
    if (ext.gt(ext.add(inAccum, inputValue), ext.add(outAccum, fee, threshold))) continue

    bytesAccum = ext.add(bytesAccum, inputBytes)
    inAccum = ext.add(inAccum, inputValue)
    inputs.push(input)

    // go again?
    if (ext.lt(inAccum, ext.add(outAccum, fee))) continue

    return utils.finalize(inputs, outputs, feeRate)
  }
  return { fee: ext.mul(feeRate, bytesAccum) }
}

// average-case: O(n*log(n))
function blackjackAsset (utxos, assetMap, feeRate, isNonAssetFunded) {
  const dustAmount = utils.dustThreshold({}, feeRate)
  const mapAssetAmounts = []
  const inputs = []
  const outputs = []
  const assetAllocations = []
  for (var i = 0; i < utxos.length; i++) {
    const input = utxos[i]
    if (!input.assetInfo) {
      continue
    }
    mapAssetAmounts[String(input.assetInfo.assetGuid) + '-' + input.assetInfo.value.toString(10)] = i
  }

  for (const [assetGuid, valueAssetObj] of assetMap.entries()) {
    let assetAllocation = assetAllocations[assetGuid]
    if (assetAllocation.length === 0) {
      assetAllocation = []
    }

    valueAssetObj.outputs.forEach(output => {
      assetAllocation.push({ n: outputs.length, value: output.value })
      outputs.push({ address: output.address, assetInfo: {assetGuid: assetGuid, value: output.value}, type: 'BECH32', value: dustAmount })
    })

    // if not expecting asset to be funded, we just want outputs then return here without inputs
    if (isNonAssetFunded) {
      return utils.finalizeAssets(inputs, outputs, assetAllocations)
    }

    const assetOutAccum = utils.sumOrNaN(valueAssetObj.outputs)
    var index = mapAssetAmounts[String(assetGuid) + '-' + assetOutAccum.toString(10)]
    // ensure every target for asset is satisfied otherwise we fail
    if (index) {
      inputs.push(utxos[index])
    } else {
      return utils.finalizeAssets(null, null, null)
    }
  }
  return utils.finalizeAssets(inputs, outputs, assetAllocations)
}

module.exports = {
  blackjack: blackjack,
  blackjackAsset: blackjackAsset
}
