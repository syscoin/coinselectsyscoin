var accumulative = require('./accumulative')
var blackjack = require('./blackjack')
var utils = require('./utils')
var ext = require('./bn-extensions')

// order by descending value, minus the inputs approximate fee
function utxoScore (x, feeRate) {
  return ext.sub(x.value, ext.mul(feeRate, utils.inputBytes(x)))
}

module.exports = function coinSelect (utxos, inputs, outputs, feeRate) {
  let utxoSys = utxos.filter(utxo => !utxo.assetInfo)
  utxoSys = utxoSys.concat().sort(function (a, b) {
    return ext.sub(utxoScore(b, feeRate), utxoScore(a, feeRate))
  })

  // attempt to use the blackjack strategy first (no change output)
  var base = blackjack.blackjack(utxoSys, inputs, outputs, feeRate)
  if (base.inputs) return base

  // else, try the accumulative strategy
  return accumulative.accumulative(utxoSys, inputs, outputs, feeRate)
}

module.exports = function coinSelectAsset (utxos, assetArray, feeRate, isNonAssetFunded) {
  const utxoAssets = utxos.filter(utxo => utxo.assetInfo != null)
  // attempt to use the blackjack strategy first (no change output)
  var base = blackjack.blackjackAsset(utxoAssets, assetArray, feeRate, isNonAssetFunded)
  if (base.inputs) return base

  // else, try the accumulative strategy
  return accumulative.accumulativeAsset(utxoAssets, assetArray, feeRate, isNonAssetFunded)
}
