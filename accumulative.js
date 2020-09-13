var utils = require('./utils')
var ext = require('./bn-extensions')
var BN = require('bn.js')
// add inputs until we reach or surpass the target value (or deplete)
// worst-case: O(n)
function accumulative (utxos, inputs, outputs, feeRate, assets) {
  if (!utils.uintOrNull(feeRate)) return {}
  var changeOutputBytes = utils.outputBytes({})
  var feeBytes = new BN(changeOutputBytes)
  var bytesAccum = utils.transactionBytes(inputs, outputs)
  var inAccum = utils.sumOrNaN(inputs)
  var outAccum = utils.sumOrNaN(outputs)
  var fee = ext.mul(feeRate, bytesAccum)
  const dustAmount = utils.dustThreshold({ type: 'BECH32' }, feeRate)
  // is already enough input?
  if (ext.gte(inAccum, ext.add(outAccum, fee))) return utils.finalize(inputs, outputs, feeRate, feeBytes)
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
    // if this is an asset input, we will need another output to send asset to so add dust satoshi to output and add output fee
    if (utxo.assetInfo) {
      outAccum = ext.add(outAccum, dustAmount)
      bytesAccum = ext.add(bytesAccum, changeOutputBytes)
      feeBytes = ext.add(feeBytes, changeOutputBytes)
      // add another bech32 output for OP_RETURN overhead
      // any extra data should be optimized out later as OP_RETURN is serialized and fees are optimized
      bytesAccum = ext.add(bytesAccum, changeOutputBytes)
      feeBytes = ext.add(feeBytes, changeOutputBytes)
      if (assets && assets.has(utxo.assetInfo.assetGuid)) {
        const utxoAssetObj = assets.get(utxo.assetInfo.assetGuid)
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
        // add bytes and fees for notary signature
        if (utxoAssetObj.notarykeyid && utxoAssetObj.notarykeyid.length > 0) {
          const sigBytes = new BN(65)
          bytesAccum = ext.add(bytesAccum, sigBytes)
          feeBytes = ext.add(feeBytes, sigBytes)
        }
      }
    }
    fee = ext.mul(feeRate, bytesAccum)
    // go again?
    if (ext.lt(inAccum, ext.add(outAccum, fee))) continue
    return utils.finalize(inputs, outputs, feeRate, feeBytes)
  }

  return { fee: ext.mul(feeRate, bytesAccum) }
}

// worst-case: O(n)
function accumulativeAsset (utxoAssets, assetMap, feeRate, txVersion, assets) {
  if (!utils.uintOrNull(feeRate)) return {}
  const isAsset = utils.isAsset(txVersion)
  const isNonAssetFunded = utils.isNonAssetFunded(txVersion)
  const dustAmount = utils.dustThreshold({ type: 'BECH32' }, feeRate)
  const assetAllocations = []
  const outputs = []
  const inputs = []
  let auxfeeValue = ext.BN_ZERO
  // loop through all assets looking to get funded, sort the utxo's and then try to fund them incrementally
  for (const [assetGuid, valueAssetObj] of assetMap.entries()) {
    const utxoAssetObj = (assetGuid > 0 && assets) ? assets.get(assetGuid) : {}
    if (utxoAssetObj === undefined) {
      continue
    }
    const assetAllocation = { assetGuid: assetGuid, values: [], notarysig: utxoAssetObj.notarysig || Buffer.from('') }
    if (!isAsset) {
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
    }
    valueAssetObj.outputs.forEach(output => {
      assetAllocation.values.push({ n: outputs.length, value: output.value })
      if (output.address === valueAssetObj.changeAddress) {
        // add change index
        outputs.push({ assetChangeIndex: assetAllocation.values.length - 1, type: 'BECH32', assetInfo: { assetGuid: assetGuid, value: output.value }, value: dustAmount })
      } else {
        outputs.push({ address: output.address, type: 'BECH32', assetInfo: { assetGuid: assetGuid, value: output.value }, value: dustAmount })
      }
    })

    // if not expecting asset to be funded, we just want outputs then return here without inputs
    if (isNonAssetFunded) {
      assetAllocations.push(assetAllocation)
      return utils.finalizeAssets(inputs, outputs, assetAllocations)
    }

    // if new/update/send we are expecting 0 value input and 0 value output, in send case output may be positive but we fund with 0 value input (asset ownership utxo)
    let assetOutAccum = isAsset ? ext.BN_ZERO : utils.sumOrNaN(valueAssetObj.outputs)
    // if auxfee exists add total output for asset with auxfee so change is calculated properly
    if (!ext.eq(auxfeeValue, ext.BN_ZERO)) {
      assetOutAccum = ext.add(assetOutAccum, auxfeeValue)
    }
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
      // asset new/update/send should be funded by 0 value input
      if (isAsset && !utxoValue.isZero()) {
        continue
      }
      // if not funding asset new/update/send, we should fund with non-zero asset utxo amounts only
      if (!isAsset && utxoValue.isZero()) {
        continue
      }
      inAccum = ext.add(inAccum, utxoValue)
      inputs.push(utxo)
      // deal with change
      if (ext.gt(inAccum, assetOutAccum)) {
        const changeAsset = ext.sub(inAccum, assetOutAccum)
        // add output as dust amount (smallest possible sys output)
        const output = { assetChangeIndex: assetAllocation.values.length, type: 'BECH32', assetInfo: { assetGuid: assetGuid, value: changeAsset }, value: dustAmount }
        // but asset commitment will have the full asset change value
        assetAllocation.values.push({ n: outputs.length, value: changeAsset })
        outputs.push(output)
        funded = true
        break
      // no change, in = out
      } else if (ext.eq(inAccum, assetOutAccum)) {
        funded = true
        break
      }
    }
    assetAllocations.push(assetAllocation)
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
