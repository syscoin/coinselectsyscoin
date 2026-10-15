const assert = require('assert')
const tape = require('tape')
const BN = require('bn.js')
const selector = require('../')
const blackjack = require('../blackjack')
const accumulative = require('../accumulative')
const test = (name, body) => tape(name, t => { t.doesNotThrow(body); t.end() })
const scriptPubKey = Buffer.from('0014' + '11'.repeat(20), 'hex')
const options = { changeOutput: { scriptPubKey } }
function coins () { return [{ type: 'BECH32', value: new BN(100000), assetInfo: { assetGuid: '123457', value: new BN(2000) } }] }
function map () { return new Map([['123457', { changeAddress: 'change', changeScript: scriptPubKey, outputs: [{ address: 'recipient', scriptPubKey, value: new BN(1000) }] }]]) }
test('legacy script is data payload, not a spend locking script', () => {
  for (const script of [Buffer.alloc(0), Buffer.from([0]), Buffer.from([1, 2, 3]), new Uint8Array([0x76, 0xa9])]) {
    assert.strictEqual(selector.utils.dustThreshold({ script }, new BN(100)).toString(), '0')
    for (const amount of [0, 50000]) {
      const output = { script, value: new BN(amount) }
      const result = selector.coinSelect([{ type: 'BECH32', value: new BN(100000) }], [], [output], new BN(1), 2, undefined, undefined, options)
      assert.ok(result.inputs)
      assert.strictEqual(result.outputs[0].value.toString(), String(amount))
      assert.deepStrictEqual(result.outputs[0].script, script)
      assert.strictEqual(result.inputs[0].value.sub(result.outputs.reduce((sum, out) => sum.add(out.value), new BN(0))).toString(), result.fee.toString())
    }
  }
})
test('legacy data payload cannot bypass explicit full-script enforcement', () => {
  const data = { script: Buffer.from([1]), scriptPubKey, value: new BN(0) }
  const result = selector.coinSelect([{ type: 'BECH32', value: new BN(100000) }], [], [data], new BN(1))
  assert.strictEqual(result.error, 'DUST_OUTPUT')
  assert.strictEqual(selector.utils.validateDustOutputs([{ script: Buffer.from([1]), scriptPubKey: 'invalid', value: new BN(0) }]).error, 'INVALID_OUTPUT_SCRIPT')
})
test('SPT gas funding preserves zero-valued legacy payload and allocation indexes', () => {
  for (const script of [Buffer.from([1, 2]), new Uint8Array([0, 0xff])]) {
    const assets = selector.coinSelectAsset(coins(), map(), new BN(1), 142, options)
    const outputs = assets.outputs.concat({ script, value: new BN(0) })
    const result = selector.coinSelectAssetGas(assets.assetAllocations, [], assets.inputs, outputs, new BN(1), 142, new Map(), map(), undefined, options)
    assert.ok(result.inputs)
    assert.deepStrictEqual(result.outputs[2].script, script)
    assert.strictEqual(result.outputs[2].value.toString(), '0')
    assert.deepStrictEqual(assets.assetAllocations[0].values.map(value => value.n), [0, 1])
    assert.deepStrictEqual(result.outputs.slice(0, 2).map(output => output.assetInfo.value.toString()), ['1000', '1000'])
  }
})
for (const field of ['recipient', 'change']) {
  test(`malformed asset ${field} script returns a structured public API error`, () => {
    for (const bad of [null, '0014', {}, [0, 20], () => scriptPubKey]) {
      const assetMap = map()
      if (field === 'recipient') assetMap.get('123457').outputs[0].scriptPubKey = bad
      else assetMap.get('123457').changeScript = bad
      for (const run of [selector.coinSelectAsset, blackjack.blackjackAsset, accumulative.accumulativeAsset]) {
        const result = run(coins(), assetMap, new BN(1), 142, options)
        assert.strictEqual(result.error, 'INVALID_OUTPUT_SCRIPT')
      }
    }
  })
}
for (const existing of [false, true]) {
  test(`asset-gas ${existing ? 'existing' : 'new'} allocation refuses malformed change before mutation`, () => {
    const assetMap = map()
    assetMap.get('123457').changeScript = 'invalid'
    const allocations = existing ? [{ assetGuid: '123457', values: [{ n: 0, value: new BN(1000) }] }] : []
    const inputs = []
    const outputs = existing
      ? [{ scriptPubKey, value: new BN(294), assetInfo: { assetGuid: '123457', value: new BN(1000) } }]
      : [{ scriptPubKey, value: new BN(50000) }]
    const result = selector.coinSelectAssetGas(allocations, coins(), inputs, outputs, new BN(1), 142, new Map(), assetMap, undefined, options)
    assert.strictEqual(result.error, 'INVALID_OUTPUT_SCRIPT')
    assert.strictEqual(inputs.length, 0)
    assert.strictEqual(outputs.length, 1)
    assert.strictEqual(allocations.length, existing ? 1 : 0)
    if (existing) assert.strictEqual(allocations[0].values.length, 1)
  })
}
test('asset-gas API also validates malformed requested recipient metadata', () => {
  const assetMap = map()
  assetMap.get('123457').outputs[0].scriptPubKey = 'invalid'
  const result = selector.coinSelectAssetGas([], coins(), [], [{ scriptPubKey, value: new BN(50000) }], new BN(1), 142, new Map(), assetMap, undefined, options)
  assert.strictEqual(result.error, 'INVALID_OUTPUT_SCRIPT')
})
