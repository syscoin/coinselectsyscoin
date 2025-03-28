const utils = require('./utils')
const ext = require('./bn-extensions')
const BN = require('bn.js')
// add inputs until we reach or surpass the target value (or deplete)
// worst-case: O(n)
function accumulative (utxos, inputs, outputs, feeRate, memoSize, blobSize) {
  if (!utils.uintOrNull(feeRate)) return {}
  const changeOutputBytes = utils.outputBytes({})
  let memoPadding = 0
  if (memoSize) {
    memoPadding = memoSize + 5 + 8 // opreturn overhead + memo size + amount int64
  }
  blobSize = blobSize || 0
  let feeBytes = new BN(changeOutputBytes.toNumber() + 4)
  let bytesAccum = utils.transactionBytes(inputs, outputs)
  let inAccum = utils.sumOrNaN(inputs)
  let outAccum = utils.sumOrNaN(outputs)
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
  if (ext.gte(inAccum, ext.add(outAccum, fee))) return utils.finalize(inputs, outputs, feeRate, feeBytes)
  for (let i = 0; i < utxos.length; i++) {
    const utxo = utxos[i]
    const utxoBytes = utils.inputBytes(utxo)
    const utxoFee = ext.mul(feeRate, utxoBytes)
    const utxoValue = utils.uintOrNull(utxo.value)

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
    if (ext.lt(inAccum, ext.add(outAccum, fee))) continue
    return utils.finalize(inputs, outputs, feeRate, feeBytes)
  }

  return { fee: ext.mul(feeRate, bytesAccum) }
}

// worst-case: O(n)
function accumulativeAsset (utxoAssets, assetMap, feeRate, txVersion) {
  if (!utils.uintOrNull(feeRate)) return {}
  const dustAmount = utils.dustThreshold({ type: 'BECH32' }, feeRate)
  const isNonAssetFunded = utils.isNonAssetFunded(txVersion)
  const assetAllocations = []
  const outputs = []
  const inputs = []
  // loop through all assets looking to get funded, sort the utxo's and then try to fund them incrementally
  for (const [assetGuid, valueAssetObj] of assetMap.entries()) {
    const assetAllocation = { assetGuid: assetGuid, values: [] }

    valueAssetObj.outputs.forEach(output => {
      assetAllocation.values.push({ n: outputs.length, value: output.value })
      if (output.address === valueAssetObj.changeAddress) {
        // add change index
        outputs.push({ assetChangeIndex: assetAllocation.values.length - 1, type: 'BECH32', assetInfo: { assetGuid: assetGuid, value: output.value }, value: dustAmount })
      } else {
        outputs.push({ address: output.address, type: 'BECH32', assetInfo: { assetGuid: assetGuid, value: output.value }, value: dustAmount })
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
          const output = { assetChangeIndex: assetAllocation.values.length, type: 'BECH32', assetInfo: { assetGuid: assetGuid, value: changeAsset }, value: dustAmount }
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
  accumulative: accumulative,
  accumulativeAsset: accumulativeAsset
}
