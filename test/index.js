var coinselect = require('../')
var fixtures = require('./fixtures')
var fixturesAsset = require('./fixturesasst')
var tape = require('tape')
var utils = require('./_utils')

fixtures.forEach(function (f) {
  tape(f.description, function (t) {
    var utxos = utils.expand(f.inputs, true)

    var outputs = utils.expand(f.outputs)
    var inputs = []
    var actual = coinselect.coinSelect(utxos, inputs, outputs, f.feeRate)

    t.same(actual, f.expected)
    if (actual.inputs) {
      inputs = []
      var feedback = coinselect.coinSelect(actual.inputs, inputs, actual.outputs, f.feeRate)
      t.same(feedback, f.expected)
    }

    t.end()
  })
})
fixturesAsset.forEach(function (f) {
  tape(f.description, function (t) {
    var utxos = utils.expand(f.utxos, true)
    var outputs = utils.expand(f.assetMap)
    var actual = coinselect.coinSelectAsset(utxos, outputs, f.feeRate, f.isNonAssetFunded)

    t.same(actual, f.expected)
    if (actual.inputs) {
      var feedback = coinselect.coinSelectAsset(actual.inputs, outputs, f.feeRate, f.isNonAssetFunded)
      t.same(feedback, f.expected)
    }

    t.end()
  })
})
