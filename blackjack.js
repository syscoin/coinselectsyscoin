const utils = require('./utils')
const ext = require('./bn-extensions')
const BN = require('bn.js')
// only add inputs if they don't bust the target value (aka, exact match)
// worst-case: O(n)
function blackjack (utxos, inputs, outputs, feeRate, txVersion, memoSize, blobSize) {
  if (!utils.uintOrNull(feeRate)) return {}

  // Blackjack doesn't make sense for subtract fee outputs - return empty to fall back to accumulative
  const hasSubtractFee = outputs.some(o => o.subtractFeeFrom === true)
  if (hasSubtractFee) return {}

  const changeOutputBytes = utils.outputBytes({})
  let memoPadding = 0
  if (memoSize) {
    memoPadding = memoSize + 5 + 8 // opreturn overhead + memo size + amount int64
  }
  blobSize = blobSize || 0
  let feeBytes = new BN(changeOutputBytes.toNumber() + 4)
  let bytesAccum = utils.transactionBytes(inputs, outputs)
  let inAccum = utils.sumOrNaN(inputs)
  let outAccum = utils.sumOrNaN(outputs, txVersion)
  const memBytes = new BN(memoPadding)
  let blobBytes = new BN(blobSize)
  // factor blobs by 100x in fee market
  blobBytes = ext.mul(blobBytes, new BN(0.01))
  bytesAccum = ext.add(bytesAccum, memBytes)
  feeBytes = ext.add(feeBytes, memBytes)
  feeBytes = ext.add(feeBytes, blobBytes)
  let fee = ext.mul(feeRate, bytesAccum)
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
  if (ext.gte(inAccum, ext.add(outAccum, fee))) return utils.finalize(inputs, outputs, feeRate, changeOutputBytes)

  const threshold = utils.dustThreshold({}, feeRate)
  for (let i = 0; i < utxos.length; i++) {
    const input = utxos[i]
    const inputBytes = utils.inputBytes(input)
    fee = ext.mul(feeRate, ext.add(bytesAccum, inputBytes))
    const inputValue = utils.uintOrNull(input.value)

    // would it waste value?
    if (ext.gt(ext.add(inAccum, inputValue), ext.add(outAccum, fee, threshold))) continue

    bytesAccum = ext.add(bytesAccum, inputBytes)
    inAccum = ext.add(inAccum, inputValue)
    inputs.push(input)
    // if this is an asset input, we will need another output to send asset to so add dust satoshi to output and add output fee
    if (input.assetInfo) {
      outAccum = ext.add(outAccum, dustAmount)
      bytesAccum = ext.add(bytesAccum, utils.outputBytes({ type: 'BECH32' }))
      // double up to be safe
      bytesAccum = ext.add(bytesAccum, changeOutputBytes)
      feeBytes = ext.add(feeBytes, changeOutputBytes)
      // add another bech32 output for OP_RETURN overhead
      // any extra data should be optimized out later as OP_RETURN is serialized and fees are optimized
      bytesAccum = ext.add(bytesAccum, utils.outputBytes({ type: 'BECH32' }))
      fee = ext.mul(feeRate, bytesAccum)
    }

    // go again?
    if (ext.lt(inAccum, ext.add(outAccum, fee))) continue

    return utils.finalize(inputs, outputs, feeRate, feeBytes)
  }
  return { fee: ext.mul(feeRate, bytesAccum) }
}

// average-case: O(n*log(n))
function blackjackAsset (utxos, assetMap, feeRate, txVersion) {
  if (!utils.uintOrNull(feeRate)) return {}
  const dustAmount = utils.dustThreshold({ type: 'BECH32' }, feeRate)
  const isNonAssetFunded = utils.isNonAssetFunded(txVersion)
  const mapAssetAmounts = new Map()
  const inputs = []
  const outputs = []
  const assetAllocations = []
  for (let i = 0; i < utxos.length; i++) {
    const input = utxos[i]
    if (!input.assetInfo) {
      continue
    }
    mapAssetAmounts.set(input.assetInfo.assetGuid + '-' + input.assetInfo.value.toString(10), i)
  }

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
    if (!isNonAssetFunded) {
      let funded = false
      const assetOutAccum = utils.sumOrNaN(valueAssetObj.outputs)
      // make sure total amount output exists
      const index = mapAssetAmounts.get(assetGuid + '-' + assetOutAccum.toString(10))
      // ensure every target for asset is satisfied otherwise we fail
      if (!funded && index) {
        inputs.push(utxos[index])
        funded = true
      }
      assetAllocations.push(assetAllocation)
      // shortcut when we know an asset spend is not funded
      if (!funded) {
        return utils.finalizeAssets(null, null, null, null, null)
      }
    } else {
      assetAllocations.push(assetAllocation)
    }
  }
  return utils.finalizeAssets(inputs, outputs, assetAllocations)
}

module.exports = {
  blackjack: blackjack,
  blackjackAsset: blackjackAsset
}
