const assert = require('assert')
const tape = require('tape')
const BN = require('bn.js')
const candidate = require('../')
const utils = candidate.utils
const test = (name, body) => tape(name, t => { t.doesNotThrow(body); t.end() })
const p2wpkh = Buffer.from('0014' + '11'.repeat(20), 'hex')
const p2pkh = Buffer.from('76a914' + '22'.repeat(20) + '88ac', 'hex')
const p2sh = Buffer.from('a914' + '33'.repeat(20) + '87', 'hex')
const p2wsh = Buffer.from('0020' + '44'.repeat(32), 'hex')
const p2tr = Buffer.from('5120' + '55'.repeat(32), 'hex')
const options = { changeOutput: { scriptPubKey: p2wpkh } }
function coins (value) { return [{ type: 'BECH32', value: new BN(value) }] }
function native (amount, rate, extra, policy) {
  return candidate.coinSelect(coins(100000), [], [Object.assign({ scriptPubKey: p2wpkh, value: new BN(amount) }, extra)], new BN(rate), 2, undefined, undefined, policy)
}
for (const [type, scriptPubKey, minimum] of [['BECH32', p2wpkh, 294], ['LEGACY', p2pkh, 546], ['P2SH', p2sh, 540], ['P2WSH', p2wsh, 330], ['P2TR', p2tr, 330]]) {
  test(`${type}: type and actual-script dust floors ignore transaction fee`, () => {
    for (const rate of [1, 100]) {
      assert.strictEqual(utils.dustThreshold({ type }, new BN(rate)).toString(), String(minimum))
      assert.strictEqual(utils.dustThreshold({ type: 'misleading', scriptPubKey }, new BN(rate)).toString(), String(minimum))
    }
  })
  test(`${type}: reject floor minus one and retain equality exactly`, () => {
    const run = value => candidate.coinSelect(coins(100000), [], [{ scriptPubKey, value: new BN(value) }], new BN(1))
    assert.strictEqual(run(minimum - 1).error, 'DUST_OUTPUT')
    assert.strictEqual(run(minimum).outputs[0].value.toString(), String(minimum))
  })
}
test('missing type is conservative LEGACY and actual script wins over hints/data script', () => {
  assert.strictEqual(utils.dustThreshold({}).toString(), '546')
  assert.strictEqual(utils.dustThreshold({ type: 'unknown' }).toString(), '546')
  assert.strictEqual(utils.dustThreshold({ type: '__proto__' }).toString(), '546')
  assert.strictEqual(utils.dustThreshold({ type: 'constructor' }).toString(), '546')
  assert.strictEqual(utils.dustThreshold({ type: 'LEGACY', script: Buffer.from('6a', 'hex'), scriptPubKey: p2wpkh }).toString(), '294')
  assert.strictEqual(utils.dustThreshold({ script: p2wpkh, scriptPubKey: Buffer.from('6a', 'hex') }).toString(), '0')
  assert.strictEqual(utils.dustThreshold({ script: p2pkh }).toString(), '546')
})
test('dust metadata does not change the existing transaction fee estimator', () => {
  assert.strictEqual(utils.outputBytes({ scriptPubKey: p2wpkh }).toString(), '34')
  assert.strictEqual(utils.outputBytes({ type: 'BECH32', scriptPubKey: p2pkh }).toString(), '31')
})
test('actual script compact length, witness shape and unspendable rules match Core', () => {
  for (const length of [252, 253]) assert.strictEqual(utils.dustThreshold({ scriptPubKey: Buffer.alloc(length, 0x61) }).toString(), String((8 + (length < 253 ? 1 : 3) + length + 148) * 3))
  assert.strictEqual(utils.dustThreshold({ scriptPubKey: Buffer.from('6020' + '11'.repeat(32), 'hex') }).toString(), '330')
  assert.strictEqual(utils.dustThreshold({ scriptPubKey: Buffer.from('0014' + '11'.repeat(19), 'hex') }).toString(), String((8 + 1 + 21 + 148) * 3))
  assert.strictEqual(utils.dustThreshold({ script: Buffer.from('6a01ff', 'hex') }).toString(), '0')
  assert.strictEqual(utils.dustThreshold({ scriptPubKey: Buffer.alloc(10001, 0x61) }).toString(), '0')
})
test('bitcoinjs7 Uint8Array data and spend scripts are accepted, not arbitrary objects', () => {
  assert.strictEqual(utils.dustThreshold({ script: new Uint8Array([0x6a, 1, 1]) }).toString(), '0')
  assert.strictEqual(utils.dustThreshold({ scriptPubKey: new Uint8Array(p2wpkh) }, undefined, { changeOutput: { scriptPubKey: new Uint8Array(p2pkh) } }).toString(), '294')
  assert.strictEqual(native(1000, 1, { scriptPubKey: { length: 22 } }).error, 'INVALID_OUTPUT_SCRIPT')
  assert.strictEqual(native(1000, 1, { scriptPubKey: '0014' }).error, 'INVALID_OUTPUT_SCRIPT')
})
test('custom relay rate is independent data, nonnegative BN and rounded up', () => {
  for (const [rate, minimum] of [[1000, 98], [1001, 99], [0, 0]]) assert.strictEqual(utils.dustThreshold({ scriptPubKey: p2wpkh }, new BN(999), { dustRelayFee: new BN(rate) }).toString(), String(minimum))
  for (const dustRelayFee of [-1, 3000, Infinity, NaN, '3000', new BN(-1)]) assert.strictEqual(native(1000, 1, {}, { dustRelayFee }).error, 'INVALID_DUST_OPTIONS')
})
test('callbacks are rejected without being invoked', () => {
  let called = false
  assert.strictEqual(native(1000, 1, {}, () => { called = true; return new BN(0) }).error, 'INVALID_DUST_OPTIONS')
  assert.strictEqual(called, false)
  assert.strictEqual(native(1000, 1, {}, { changeOutput: { scriptPubKey: () => p2wpkh } }).error, 'INVALID_DUST_OPTIONS')
})
test('default MAX floor is independent of a high transaction fee', () => {
  const result = candidate.coinSelect(coins(11700), [], [{ scriptPubKey: p2wpkh, value: new BN(11700), subtractFeeFrom: true }], new BN(100))
  assert.strictEqual(result.outputs[0].value.toString(), '400')
  assert.strictEqual(result.fee.toString(), '11300')
})
test('native change equality is retained and dust remainder becomes actual fee', () => {
  const equal = native(99555, 1, {}, options)
  assert.strictEqual(equal.outputs[1].value.toString(), '294')
  assert.ok(equal.outputs[1].scriptPubKey.equals(p2wpkh))
  const below = native(99556, 1, {}, options)
  assert.strictEqual(below.outputs.length, 1)
  assert.strictEqual(below.outputs[0].value.toString(), '99556')
  assert.strictEqual(below.fee.toString(), '444')
  const custom = native(99751, 1, {}, { changeOutput: { scriptPubKey: p2wpkh }, dustRelayFee: new BN(1000) })
  assert.strictEqual(custom.outputs[1].value.toString(), '98')
})
function assetMap () { return new Map([['123457', { changeAddress: 'asset-change', changeScript: p2pkh, outputs: [{ address: 'recipient', scriptPubKey: p2wpkh, value: new BN(1000) }] }]]) }
function assetCoins () { return [{ type: 'BECH32', value: new BN(100000), assetInfo: { assetGuid: '123457', value: new BN(2000) } }] }
test('SPT recipient/change scripts and allocation values survive at low/high fee', () => {
  for (const rate of [1, 100]) {
    const result = candidate.coinSelectAsset(assetCoins(), assetMap(), new BN(rate), 142)
    assert.deepStrictEqual(result.outputs.map(o => o.value.toString()), ['294', '546'])
    assert.ok(result.outputs[0].scriptPubKey.equals(p2wpkh))
    assert.ok(result.outputs[1].scriptPubKey.equals(p2pkh))
    assert.deepStrictEqual(result.outputs.map(o => o.assetInfo.value.toString()), ['1000', '1000'])
    assert.deepStrictEqual(result.assetAllocations[0].values.map(v => v.n), [0, 1])
  }
})
test('SPT custom relay rate reaches asset selection and gas funding', () => {
  const policy = { changeOutput: { scriptPubKey: p2wpkh }, dustRelayFee: new BN(1000) }
  const result = candidate.coinSelectAsset(assetCoins(), assetMap(), new BN(1), 142, policy)
  assert.deepStrictEqual(result.outputs.map(o => o.value.toString()), ['98', '182'])
  const funded = candidate.coinSelectAssetGas(result.assetAllocations, [], result.inputs, result.outputs, new BN(1), 142, new Map(), assetMap(), undefined, policy)
  assert.ok(funded.inputs)
  assert.deepStrictEqual(funded.outputs.filter(o => o.assetInfo).map(o => o.value.toString()), ['98', '182'])
})
test('asset-gas synchronization retains change script and allocation index', () => {
  const map = new Map([['123457', { changeAddress: 'asset-change', changeScript: p2sh, outputs: [] }]])
  const allocations = []
  const result = candidate.coinSelectAssetGas(allocations, assetCoins(), [], [{ scriptPubKey: p2wpkh, value: new BN(50000) }], new BN(1), 142, new Map(), map, undefined, options)
  const carrier = result.outputs.find(o => o.assetInfo)
  assert.ok(carrier.scriptPubKey.equals(p2sh))
  assert.strictEqual(carrier.value.toString(), '540')
  assert.strictEqual(carrier.assetInfo.value.toString(), '2000')
  assert.strictEqual(allocations[0].values[0].n, result.outputs.indexOf(carrier))
})
test('OP_RETURN native burn principal is preserved, not zeroed or discarded', () => {
  const script = Buffer.from('6a01ff', 'hex')
  const result = candidate.coinSelect(coins(100000), [], [{ script, value: new BN(50000) }], new BN(1), 139, undefined, undefined, options)
  assert.strictEqual(result.outputs[0].value.toString(), '50000')
  assert.ok(result.outputs[0].script.equals(script))
})
test('split and break share default dust policy with threshold equality', () => {
  const split = require('../split')
  const broken = require('../break')
  assert.strictEqual(split(coins(407), [{ scriptPubKey: p2wpkh }], new BN(1), options).outputs[0].value.toString(), '294')
  assert.strictEqual(broken(coins(100000), { scriptPubKey: p2wpkh, value: new BN(293) }, new BN(1), options).error, 'DUST_OUTPUT')
})
