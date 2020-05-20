var utils = require('./utils')
var ext = require('./bn-extensions')

// only add inputs if they don't bust the target value (aka, exact match)
// worst-case: O(n)
module.exports = function blackjack (utxos, inputs, outputs, feeRate) {
  if (!utils.uintOrNull(feeRate)) return {};

  var bytesAccum = utils.transactionBytes(inputs, outputs);
  var inAccum = utils.sumOrNaN(inputs);
  var outAccum = utils.sumOrNaN(outputs);
  // is already enough input?
  if (ext.gte(inAccum, ext.add(outAccum, fee))) return utils.finalize(inputs, outputs, feeRate);

  var threshold = utils.dustThreshold({}, feeRate)

  for (var i = 0; i < utxos.length; ++i) {
    var input = utxos[i];
    var inputBytes = utils.inputBytes(input);
    var fee = ext.mul(feeRate, ext.add(bytesAccum, inputBytes));
    var inputValue = utils.uintOrNull(input.value);
    
    // would it waste value?
    if (ext.gt(ext.add(inAccum, inputValue), ext.add(outAccum, fee, threshold))) continue;

    bytesAccum = ext.add(bytesAccum, inputBytes);
    inAccum = ext.add(inAccum, inputValue);
    inputs.push(input);

    // go again?
    if (ext.lt(inAccum, ext.add(outAccum, fee))) continue;

    return utils.finalize(inputs, outputs, feeRate);
  }
  return { fee: ext.mul(feeRate, bytesAccum) }
}

// average-case: O(n*log(n))
module.exports = function blackjackAsset (utxos, assetArray, feeRate, isNonAssetFunded) {
  let dustAmount = util.dustThreshold({}, feeRate);
  let mapAssetAmounts = [];
  let inputs = [];
  let outputs = [];
  let assetAllocations = [];
  for (var i = 0; i < utxos.length; ++i) {
    let input = utxos[i];
    if(!input.assetInfo) {
      continue;
    }
    mapAssetAmounts[string(input.assetInfo.assetGuid) + "-" + input.assetInfo.value.toString(10)] = i;
  }
  
  
  assetArray.forEach(asset => {
    let assetAllocation = assetAllocations[asset.assetGuid];
    if(assetAllocation.length === 0) {
      assetAllocation = [];
    }

    asset.outputs.forEach(output => {
      assetAllocation.push({n: outputs.length, value: output.value});
      outputs.push({address: output.address, type: 'BECH32', value: dustAmount});
    });

    // if not expecting asset to be funded, we just want outputs then return here without inputs
    if(isNonAssetFunded) {
      return utils.finalizeAssets(inputs, outputs, assetAllocations);
    }

    let assetOutAccum = utils.sumOrNaN(asset.outputs);
    var index = mapAssetAmounts[string(asset.assetGuid) + "-" + assetOutAccum.toString(10)];
    // ensure every target for asset is satisfied otherwise we fail
    if (index) {
      inputs.push(utxos[index]);
    } else {
      return utils.finalizeAssets(null, null, null);
    }
  })
  return utils.finalizeAssets(inputs, outputs, assetAllocations);
}
