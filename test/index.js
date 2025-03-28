const coinselect = require('../')
const fixtures = require('./fixtures')
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
