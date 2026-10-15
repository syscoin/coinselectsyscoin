const assert = require('assert')
const tape = require('tape')
const test = (name, body) => tape(name, t => { t.doesNotThrow(body); t.end() })
const BN = require('bn.js')
const candidate = require('../')
const fixtures = require('./fixtures')
const { expand } = require('./_utils')
function copy (value) {
  if (BN.isBN(value)) return value.clone()
  if (Array.isArray(value)) return value.map(copy)
  if (value && typeof value === 'object') {
    const result = {}
    Object.keys(value).forEach(k => { result[k] = copy(value[k]) })
    return result
  }
  return value
}
function canonical (value) {
  if (BN.isBN(value)) return value.toString(10)
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    const result = {}
    Object.keys(value).forEach(k => { result[k] = canonical(value[k]) })
    return result
  }
  return value
}
for (const fixture of fixtures) {
  test(`omitting native policy preserves fixture: ${fixture.description}`, () => {
    const run = lib => lib.coinSelect(expand(copy(fixture.inputs), true), [], expand(copy(fixture.outputs)), copy(fixture.feeRate))
    assert.deepStrictEqual(canonical(run(candidate)), canonical(fixture.expected))
  })
}
test('explicit relay policy allows MAX equality, independent of fee', () => {
  const result = candidate.coinSelect([{ type: 'BECH32', value: new BN(11594) }], [],
    [{ value: new BN(11594), subtractFeeFrom: true }], new BN(100), 2, undefined, undefined, () => new BN(294))
  assert.strictEqual(result.outputs.length, 1)
  assert.strictEqual(result.outputs[0].value.toString(), '294')
  assert.strictEqual(result.fee.toString(), '11300')
})
test('explicit policy refuses an insufficient MAX without deleting its recipient', () => {
  const result = candidate.coinSelect([{ type: 'BECH32', value: new BN(406) }], [],
    [{ value: new BN(406), subtractFeeFrom: true }], new BN(1), 2, undefined, undefined, () => new BN(294))
  assert.strictEqual(result.error, 'SUBTRACT_FEE_FAILED')
  assert.strictEqual(result.outputs, undefined)
})
test('two same-identity MAX recipients remain ordered and distinct', () => {
  const result = candidate.coinSelect([{ type: 'BECH32', value: new BN(1000) }], [],
    [{ address: 'same', value: new BN(400), subtractFeeFrom: true }, { address: 'same', value: new BN(600), subtractFeeFrom: true }], new BN(1), 2, undefined, undefined, () => new BN(294))
  assert.deepStrictEqual(result.outputs.map(o => [o.address, o.value.toString()]), [['same', '294'], ['same', '559']])
})
