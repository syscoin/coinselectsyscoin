var accumulative = require('./accumulative')
var blackjack = require('./blackjack')
var utils = require('./utils')
var ext = require('./bn-extensions')

// order by descending value, minus the inputs approximate fee
function utxoScore (x, feeRate) {
  return ext.sub(x.value, ext.mul(feeRate, utils.inputBytes(x)))
}

function coinSelect (utxos, inputs, outputs, feeRate) {
  let utxoSys = utxos.filter(utxo => !utxo.assetInfo)
  utxoSys = utxoSys.concat().sort(function (a, b) {
    return ext.sub(utxoScore(b, feeRate), utxoScore(a, feeRate))
  })
  var inputsCopy = inputs.slice(0)
  // attempt to use the blackjack strategy first (no change output)
  var base = blackjack.blackjack(utxoSys, inputs, outputs, feeRate)
  if (base.inputs) return base
  // reset inputs, in case of funding assets inputs passed into coinSelect may have assets prefunded and therefor we preserve inputs passed in
  // instead of accumulate between the two coin selection algorithms
  inputs = inputsCopy
  // else, try the accumulative strategy
  return accumulative.accumulative(utxoSys, inputs, outputs, feeRate)
}

function coinSelectAsset (utxos, assetMap, feeRate, isNonAssetFunded) {
  const utxoAssets = utxos.filter(utxo => utxo.assetInfo != null)
  // attempt to use the blackjack strategy first (no change output)
  var base = blackjack.blackjackAsset(utxoAssets, assetMap, feeRate, isNonAssetFunded)
  if (base.inputs) return base

  // else, try the accumulative strategy
  return accumulative.accumulativeAsset(utxoAssets, assetMap, feeRate, isNonAssetFunded)
}

module.exports = {
  coinSelect: coinSelect,
  coinSelectAsset: coinSelectAsset
}
