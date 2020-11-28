const coinselect = require('../')
const fixtures = require('./fixtures')
const fixturesAsset = require('./fixturesasset')
const tape = require('tape')
const utils = require('./_utils')

fixtures.forEach(function (f) {
  tape(f.description, function (t) {
    const utxos = utils.expand(f.inputs, true)

    const outputs = utils.expand(f.outputs)
    let inputs = []
    const actual = coinselect.coinSelect(utxos, inputs, outputs, f.feeRate)

    t.same(actual, f.expected)
    if (actual.inputs) {
      inputs = []
      const feedback = coinselect.coinSelect(actual.inputs, inputs, actual.outputs, f.feeRate)
      t.same(feedback, f.expected)
    }

    t.end()
  })
})

fixturesAsset.forEach(function (f) {
  tape(f.description, function (t) {
    const utxos = utils.expand(f.utxos, true)
    const utxoAssets = utxos.filter(utxo => utxo.assetInfo !== undefined)
    const actual = coinselect.coinSelectAsset(utxoAssets, f.assetMap, f.feeRate, f.txVersion)

    t.same(actual, f.expected)
    if (actual.inputs) {
      const feedback = coinselect.coinSelectAsset(actual.inputs, f.assetMap, f.feeRate, f.txVersion)
      t.same(feedback, f.expected)
    }

    t.end()
  })
})
