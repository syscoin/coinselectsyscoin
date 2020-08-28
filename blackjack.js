var utils = require('./utils')
var ext = require('./bn-extensions')
var BN = require('bn.js')
// only add inputs if they don't bust the target value (aka, exact match)
// worst-case: O(n)
function blackjack (utxos, inputs, outputs, feeRate, assets) {
  if (!utils.uintOrNull(feeRate)) return {}
  var changeOutputBytes = utils.outputBytes({})
  var feeBytes = new BN(changeOutputBytes)
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
      if (assets && assets.has(input.assetInfo.assetGuid)) {
        const utxoAssetObj = assets.get(input.assetInfo.assetGuid)
        // auxfee for this asset exists add another output
        if (utxoAssetObj.auxfeeaddress && utxoAssetObj.auxfeedetails && utxoAssetObj.auxfeedetails.auxfees && utxoAssetObj.auxfeedetails.auxfees.length > 0) {
          outAccum = ext.add(outAccum, dustAmount)
          bytesAccum = ext.add(bytesAccum, changeOutputBytes)
          feeBytes = ext.add(feeBytes, changeOutputBytes)
          // add another bech32 output for OP_RETURN overhead
          // any extra data should be optimized out later as OP_RETURN is serialized and fees are optimized
          bytesAccum = ext.add(bytesAccum, changeOutputBytes)
          feeBytes = ext.add(feeBytes, changeOutputBytes)
        }
      }
    }

    // go again?
    if (ext.lt(inAccum, ext.add(outAccum, fee))) continue

    return utils.finalize(inputs, outputs, feeRate, feeBytes)
  }
  return { fee: ext.mul(feeRate, bytesAccum) }
}

// average-case: O(n*log(n))
function blackjackAsset (utxos, assetMap, feeRate, txVersion, assets) {
  if (!utils.uintOrNull(feeRate)) return {}
  const isAsset = utils.isAsset(txVersion)
  const isNonAssetFunded = utils.isNonAssetFunded(txVersion)
  const dustAmount = utils.dustThreshold({ type: 'BECH32' }, feeRate)
  const mapAssetAmounts = new Map()
  const inputs = []
  const outputs = []
  const assetAllocations = []
  let auxfeeValue = ext.BN_ZERO
  for (var i = 0; i < utxos.length; i++) {
    const input = utxos[i]
    if (!input.assetInfo) {
      continue
    }
    mapAssetAmounts.set(String(input.assetInfo.assetGuid) + '-' + input.assetInfo.value.toString(10), i)
  }

  for (const [assetGuid, valueAssetObj] of assetMap.entries()) {
    const utxoAssetObj = assets ? assets.get(assetGuid) : {}
    if (utxoAssetObj === undefined) {
      continue
    }
    const assetAllocation = { assetGuid: assetGuid, values: [], notarysig: Buffer.from('') }
    // if notary is set in the asset object use notarysig of asset map which is likely prefilled 65 bytes from sanitizeUtxos
    if (utxoAssetObj.notarykeyid && utxoAssetObj.notarykeyid.length > 0) {
      assetAllocation.notarysig = utxoAssetObj.notarysig
    }
    // auxfee is set and its an allocation send
    if (txVersion === utils.SYSCOIN_TX_VERSION_ALLOCATION_SEND && utxoAssetObj.auxfeeaddress && utxoAssetObj.auxfeedetails && utxoAssetObj.auxfeedetails.auxfees && utxoAssetObj.auxfeedetails.auxfees.length > 0) {
      let totalAssetValue = ext.BN_ZERO
      // find total amount for this asset from assetMap
      valueAssetObj.outputs.forEach(output => {
        totalAssetValue = ext.add(totalAssetValue, output.value)
      })
      // get auxfee based on auxfee table and total amount sending
      auxfeeValue = utils.getAuxFee(utxoAssetObj.auxfeedetails, totalAssetValue)
      assetAllocation.values.push({ n: outputs.length, value: auxfeeValue })
      outputs.push({ address: utxoAssetObj.auxfeeaddress, type: 'BECH32', assetInfo: { assetGuid: assetGuid, value: auxfeeValue }, value: dustAmount })
    }
    valueAssetObj.outputs.forEach(output => {
      assetAllocation.values.push({ n: outputs.length, value: output.value })
      outputs.push({ assetChangeIndex: output.address === valueAssetObj.changeAddress ? assetAllocation.values.length - 1 : null, type: 'BECH32', address: output.address, assetInfo: { assetGuid: assetGuid, value: output.value }, value: dustAmount })
    })
    assetAllocations.push(assetAllocation)
    // if not expecting asset to be funded, we just want outputs then return here without inputs
    if (isNonAssetFunded) {
      return utils.finalizeAssets(inputs, outputs, assetAllocations)
    }
    // if new/update/send we are expecting 0 value input and 0 value output, in send case output may be positive but we fund with 0 value input (asset ownership utxo)
    let assetOutAccum = isAsset ? ext.BN_ZERO : utils.sumOrNaN(valueAssetObj.outputs)
    // if auxfee exists add total output for asset with auxfee so change is calculated properly
    if (!ext.eq(auxfeeValue, ext.BN_ZERO)) {
      assetOutAccum = ext.add(assetOutAccum, auxfeeValue)
    }
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
