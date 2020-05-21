var accumulative = require('../accumulative')
var fixtures = require('./fixtures/accumulative')

var tape = require('tape')
var utils = require('./_utils')

fixtures.forEach(function (f) {
  tape(f.description, function (t) {
    var utxos = utils.expand(f.inputs, true)
    var outputs = utils.expand(f.outputs)
    var inputs = []
    var actual = accumulative.accumulative(utxos, inputs, outputs, f.feeRate)

    t.same(actual.inputs, f.expected.inputs)
    t.same(actual.outputs, f.expected.outputs)
    if (f.expected.fee) t.ok(actual.fee.eq(f.expected.fee))
    else t.ok(actual.fee === f.expected.fee)

    if (actual.inputs) {
      inputs = []
      var feedback = accumulative.accumulative(actual.inputs, inputs, actual.outputs, f.feeRate)
      t.same(feedback.inputs, f.expected.inputs)
      t.same(feedback.outputs, f.expected.outputs)
      if (f.expected.fee) t.ok(feedback.fee.eq(f.expected.fee))
      else t.ok(actual.fee === f.expected.fee)
    }

    t.end()
  })
})/*
var fixturesasset = require('./fixturesasset/accumulativeasset')
fixturesasset.forEach(function (f) {
  tape(f.description, function (t) {
    var utxos = utils.expand(f.utxos, true)
    const utxoAssets = utxos.filter(utxo => utxo.assetInfo != null)
    var outputs = utils.expand(f.outputs)
    var actual = accumulative.accumulativeAsset(utxoAssets, outputs, f.feeRate, f.isNonAssetFunded)

    t.same(actual.inputs, f.expected.inputs)
    t.same(actual.outputs, f.expected.outputs)
    if (f.expected.fee) t.ok(actual.fee.eq(f.expected.fee))
    else t.ok(actual.fee === f.expected.fee)

    if (actual.inputs) {
      var feedback = accumulative.accumulativeAsset(actual.inputs, actual.outputs, f.feeRate, f.isNonAssetFunded)
      t.same(feedback.inputs, f.expected.inputs)
      t.same(feedback.outputs, f.expected.outputs)
      if (f.expected.fee) t.ok(feedback.fee.eq(f.expected.fee))
      else t.ok(actual.fee === f.expected.fee)
    }

    t.end()
  })
}) */
