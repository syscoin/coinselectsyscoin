var accumulative = require('./accumulative')
var blackjack = require('./blackjack')
var utils = require('./utils')
var ext = require('./bn-extensions')

// order by descending value, minus the inputs approximate fee
function utxoScore (x, feeRate) {
  return ext.sub(x.value, ext.mul(feeRate, utils.inputBytes(x)))
}

function coinSelect (utxos, inputs, outputs, feeRate, assets, txVersion) {
  let utxoSys = utxos.filter(utxo => !utxo.assetInfo)
  utxoSys = utxoSys.concat().sort(function (a, b) {
    return ext.sub(utxoScore(b, feeRate), utxoScore(a, feeRate))
  })
  var inputsCopy = inputs.slice(0)
  // attempt to use the blackjack strategy first (no change output)
  var base = blackjack.blackjack(utxoSys, inputs, outputs, feeRate, assets, txVersion)
  if (base.inputs && base.inputs.length > 0) return base
  // reset inputs, in case of funding assets inputs passed into coinSelect may have assets prefunded and therefor we preserve inputs passed in
  // instead of accumulate between the two coin selection algorithms
  inputs = inputsCopy
  // else, try the accumulative strategy
  return accumulative.accumulative(utxoSys, inputs, outputs, feeRate, assets, txVersion)
}

function coinSelectAsset (utxos, assetMap, feeRate, txVersion, assets) {
  const utxoAssets = utxos.filter(utxo => utxo.assetInfo !== undefined)
  // attempt to use the blackjack strategy first (no change output)
  var base = blackjack.blackjackAsset(utxoAssets, assetMap, feeRate, txVersion, assets)
  if (base.inputs && base.inputs.length > 0) return base

  // else, try the accumulative strategy
  return accumulative.accumulativeAsset(utxoAssets, assetMap, feeRate, txVersion, assets)
}
// create map of assets on inputs and outputs, compares the two and adds to outputs if any are not accounted for on inputs
// the goal is to either have new outputs created to match inputs or to update output change values to match input for each asset spent in transaction
function syncAllocationsWithInOut (assetAllocations, inputs, outputs, feeRate, txVersion, assets) {
  const dustAmount = utils.dustThreshold({ type: 'BECH32' }, feeRate)
  var mapAssetsIn = new Map()
  var mapAssetsOut = new Map()
  inputs.forEach(input => {
    if (input.assetInfo) {
      if (!mapAssetsIn.has(input.assetInfo.assetGuid)) {
        mapAssetsIn.set(input.assetInfo.assetGuid, ext.BN_ZERO)
      }
      var assetAllocationValueIn = mapAssetsIn.get(input.assetInfo.assetGuid)
      assetAllocationValueIn = ext.add(assetAllocationValueIn, input.assetInfo.value)
      mapAssetsIn.set(input.assetInfo.assetGuid, assetAllocationValueIn)
    }
  })
  // get total output value from assetAllocations, not from outputs because outputs may have removed some outputs and redirected allocations to other outputs (ie burn sys to ethereum)
  assetAllocations.forEach(voutAsset => {
    voutAsset.values.forEach(output => {
      if (!mapAssetsOut.has(voutAsset.assetGuid)) {
        mapAssetsOut.set(voutAsset.assetGuid, ext.BN_ZERO)
      }
      var assetAllocationValueOut = mapAssetsOut.get(voutAsset.assetGuid)
      assetAllocationValueOut = ext.add(assetAllocationValueOut, output.value)
      mapAssetsOut.set(voutAsset.assetGuid, assetAllocationValueOut)
    })
  })

  for (const [assetGuid, valueAssetIn] of mapAssetsIn.entries()) {
    const assetAllocation = assetAllocations.find(voutAsset => voutAsset.assetGuid === assetGuid)
    // if we have outputs for this asset we need to either update them (if change exists) or create new output for that asset change
    if (mapAssetsOut.has(assetGuid)) {
      const valueAssetOut = mapAssetsOut.get(assetGuid)
      var valueDiff
      // for SYS burn to SYSX we actually just take valueIn because valueOut is created based on SYS burn so we shoudn't valueIn-valueOut in that case
      if (txVersion !== utils.SYSCOIN_TX_VERSION_SYSCOIN_BURN_TO_ALLOCATION) {
        valueDiff = ext.sub(valueAssetIn, valueAssetOut)
      } else {
        valueDiff = valueAssetIn
      }
      if (valueDiff.isNeg()) {
        console.log('addAssetChangeFromGas: asset output cannot be larger than input. Output: ' + valueAssetOut + ' Input: ' + valueAssetIn)
        return null
      } else if (valueDiff.isZero()) {
        continue
      }
      if (assetAllocation === undefined) {
        console.log('addAssetChangeFromGas: inconsistency related to outputs with asset and assetAllocation with asset guid: ' + assetGuid)
        return null
      }
      const assetChangeOutputs = outputs.filter(output => (output.assetInfo !== undefined && output.assetInfo.assetGuid === assetGuid && output.assetChangeIndex !== undefined))
      // if change output already exists just set new value otherwise create new output and allocation
      if (assetChangeOutputs.length > 0) {
        const assetChangeOutput = assetChangeOutputs[0]
        assetChangeOutput.assetInfo.value = ext.add(assetChangeOutput.assetInfo.value, valueDiff)
        assetAllocation.values[assetChangeOutput.assetChangeIndex].value = ext.add(assetAllocation.values[assetChangeOutput.assetChangeIndex].value, valueDiff)
      } else {
        assetAllocation.values.push({ n: outputs.length, value: valueDiff })
        outputs.push({ assetChangeIndex: assetAllocation.values.length - 1, type: 'BECH32', assetInfo: { assetGuid: assetGuid, value: valueDiff }, value: dustAmount })
      }
    // asset does not exist in output, create it
    } else {
      if (assetAllocation !== undefined) {
        console.log('addAssetChangeFromGas: inconsistency related to outputs with NO asset and assetAllocation with asset guid: ' + assetGuid)
        return null
      }
      const valueDiff = valueAssetIn
      const utxoAssetObj = (assets && assets.get(assetGuid)) || {}
      const allocation = { assetGuid: assetGuid, values: [{ n: outputs.length, value: valueDiff }], notarysig: utxoAssetObj.notarysig || Buffer.from('') }
      // auxfee is set and its an allocation send
      if (txVersion === utils.SYSCOIN_TX_VERSION_ALLOCATION_SEND && utxoAssetObj.auxfeeaddress && utxoAssetObj.auxfeedetails && utxoAssetObj.auxfeedetails.auxfees && utxoAssetObj.auxfeedetails.auxfees.length > 0) {
        let totalAssetValue = ext.BN_ZERO
        // find total amount for this asset from assetMap
        valueAssetIn.outputs.forEach(output => {
          totalAssetValue = ext.add(totalAssetValue, output.value)
        })
        // get auxfee based on auxfee table and total amount sending
        const auxfeeValue = utils.getAuxFee(utxoAssetObj.auxfeedetails, totalAssetValue)
        allocation.values.push({ n: outputs.length, value: auxfeeValue })
        outputs.push({ address: utxoAssetObj.auxfeeaddress, type: 'BECH32', assetInfo: { assetGuid: assetGuid, value: auxfeeValue }, value: dustAmount })
      }
      outputs.push({ assetChangeIndex: allocation.values.length - 1, type: 'BECH32', assetInfo: { assetGuid: assetGuid, value: valueDiff }, value: dustAmount })
      assetAllocations.push(allocation)
    }
  }
  return 1
}

function coinSelectAssetGas (assetAllocations, utxos, inputs, outputs, feeRate, txVersion, assets) {
  // select asset outputs and de-duplicate inputs already selected
  let utxoSys = utxos.filter(utxo => utxo.assetInfo !== undefined && !inputs.find(input => input.txId === utxo.txId && input.vout === utxo.vout))
  utxoSys = utxoSys.concat().sort(function (a, b) {
    return ext.sub(utxoScore(b, feeRate), utxoScore(a, feeRate))
  })
  var inputsCopy = inputs.slice(0)
  // attempt to use the blackjack strategy first (no change output)
  var base = blackjack.blackjack(utxoSys, inputs, outputs, feeRate, assets)
  if (base.inputs && base.inputs.length > 0) {
    if (!syncAllocationsWithInOut(assetAllocations, base.inputs, base.outputs, feeRate, txVersion, assets)) {
      return {}
    }
    return base
  }
  // reset inputs, in case of funding assets inputs passed into coinSelect may have assets prefunded and therefor we preserve inputs passed in
  // instead of accumulate between the two coin selection algorithms
  inputs = inputsCopy
  // else, try the accumulative strategy
  const res = accumulative.accumulative(utxoSys, inputs, outputs, feeRate, assets)
  if (res.inputs) {
    if (!syncAllocationsWithInOut(assetAllocations, res.inputs, res.outputs, feeRate, txVersion, assets)) {
      return {}
    }
  }
  return res
}

module.exports = {
  coinSelect: coinSelect,
  coinSelectAsset: coinSelectAsset,
  coinSelectAssetGas: coinSelectAssetGas,
  utils: utils
}
