const accumulative = require('../accumulative')
const fixtures = require('./fixtures/accumulative')
const tape = require('tape')
const _utils = require('./_utils')

fixtures.forEach(function (f) {
  tape(f.description, function (t) {
    const utxos = _utils.expand(f.inputs, true)
    const outputs = _utils.expand(f.outputs)
    let inputs = []
    const actual = accumulative.accumulative(utxos, inputs, outputs, f.feeRate)

    t.same(actual.inputs, f.expected.inputs)
    t.same(actual.outputs, f.expected.outputs)
    if (f.expected.fee) t.ok(actual.fee.eq(f.expected.fee))
    else t.ok(actual.fee === f.expected.fee)

    if (actual.inputs) {
      inputs = []
      const feedback = accumulative.accumulative(actual.inputs, inputs, actual.outputs, f.feeRate)
      t.same(feedback.inputs, f.expected.inputs)
      t.same(feedback.outputs, f.expected.outputs)
      if (f.expected.fee) t.ok(feedback.fee.eq(f.expected.fee))
      else t.ok(actual.fee === f.expected.fee)
    }

    t.end()
  })
})
