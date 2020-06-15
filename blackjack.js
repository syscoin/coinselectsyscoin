var utils = require('./utils')
var ext = require('./bn-extensions')

// only add inputs if they don't bust the target value (aka, exact match)
// worst-case: O(n)
function blackjack (utxos, inputs, outputs, feeRate) {
  if (!utils.uintOrNull(feeRate)) return {}
  var changeOutputBytes = utils.outputBytes({})
  var bytesAccum = utils.transactionBytes(inputs, outputs)
  var inAccum = utils.sumOrNaN(inputs)
  var outAccum = utils.sumOrNaN(outputs)
  var fee = ext.mul(feeRate, bytesAccum)
  // is already enough input?
  if (ext.gte(inAccum, ext.add(outAccum, fee))) return utils.finalize(inputs, outputs, feeRate, changeOutputBytes)

  var threshold = utils.dustThreshold({}, feeRate)
  const dustAmount = utils.dustThreshold({ type: 'BECH32' }, feeRate)
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
    // if this is an asset input, we will need another output to send asset to so add dust satoshi to output and add output fee
    if (input.assetInfo) {
      outAccum = ext.add(outAccum, dustAmount)
      bytesAccum = ext.add(bytesAccum, utils.outputBytes({ type: 'BECH32' }))
      // add another bech32 output for OP_RETURN overhead
      // any extra data should be optimized out later as OP_RETURN is serialized and fees are optimized
      bytesAccum = ext.add(bytesAccum, utils.outputBytes({ type: 'BECH32' }))
      fee = ext.mul(feeRate, bytesAccum)
    }

    // go again?
    if (ext.lt(inAccum, ext.add(outAccum, fee))) continue

    return utils.finalize(inputs, outputs, feeRate, changeOutputBytes)
  }
  return { fee: ext.mul(feeRate, bytesAccum) }
}

// average-case: O(n*log(n))
function blackjackAsset (utxos, assetMap, feeRate, isNonAssetFunded, isAsset) {
  if (!utils.uintOrNull(feeRate)) return {}
  const dustAmount = utils.dustThreshold({ type: 'BECH32' }, feeRate)
  const mapAssetAmounts = new Map()
  const inputs = []
  const outputs = []
  const assetAllocations = new Map()
  for (var i = 0; i < utxos.length; i++) {
    const input = utxos[i]
    if (!input.assetInfo) {
      continue
    }
    mapAssetAmounts.set(String(input.assetInfo.assetGuid) + '-' + input.assetInfo.value.toString(10), i)
  }

  for (const [assetGuid, valueAssetObj] of assetMap.entries()) {
    if (!assetAllocations.has(assetGuid)) {
      assetAllocations.set(assetGuid, [])
    }
    const assetAllocation = assetAllocations.get(assetGuid)

    valueAssetObj.outputs.forEach(output => {
      assetAllocation.push({ n: outputs.length, value: output.value })
      outputs.push({ assetChangeIndex: output.address === valueAssetObj.changeAddress ? assetAllocation.length - 1 : null, type: 'BECH32', address: output.address, assetInfo: { assetGuid: assetGuid, value: output.value }, value: dustAmount })
    })

    // if not expecting asset to be funded, we just want outputs then return here without inputs
    if (isNonAssetFunded) {
      return utils.finalizeAssets(inputs, outputs, assetAllocations)
    }
    // if new/update/send we are expecting 0 value input and 0 value output, in send case output may be positive but we fund with 0 value input (asset ownership utxo)
    const assetOutAccum = isAsset ? ext.BN_ZERO : utils.sumOrNaN(valueAssetObj.outputs)
    const index = mapAssetAmounts.get(String(assetGuid) + '-' + assetOutAccum.toString(10))
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
