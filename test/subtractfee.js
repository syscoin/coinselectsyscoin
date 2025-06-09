const test = require('tape')
const BN = require('bn.js')
const { coinSelect } = require('../')

test('subtract fee from output - single output', function (t) {
  t.plan(5)

  const utxos = [
    { txId: '0000000000000000000000000000000000000000000000000000000000000000', vout: 0, value: new BN(10000) },
    { txId: '0000000000000000000000000000000000000000000000000000000000000001', vout: 0, value: new BN(20000) },
    { txId: '0000000000000000000000000000000000000000000000000000000000000002', vout: 0, value: new BN(30000) }
  ]

  const outputs = [
    { address: 'sys1q...', value: new BN(60000), subtractFeeFrom: true }
  ]

  const feeRate = new BN(10)

  const { inputs, outputs: resultOutputs, fee } = coinSelect(utxos, [], outputs, feeRate)

  t.equal(inputs.length, 3, 'should use all inputs')
  t.equal(resultOutputs.length, 1, 'should have single output')
  t.equal(resultOutputs[0].subtractFeeFrom, undefined, 'subtractFeeFrom flag should be removed')
  t.ok(resultOutputs[0].value, 'output should have a value')

  // Output value should be original value minus fee
  const expectedValue = new BN(60000).sub(fee)
  t.equal(resultOutputs[0].value.toString(), expectedValue.toString(), 'output value should have fee subtracted')
})

test('subtract fee with multiple outputs', function (t) {
  t.plan(6)

  const utxos = [
    { txId: '0000000000000000000000000000000000000000000000000000000000000000', vout: 0, value: new BN(100000) },
    { txId: '0000000000000000000000000000000000000000000000000000000000000001', vout: 0, value: new BN(200000) }
  ]

  const outputs = [
    { address: 'sys1q...', value: new BN(50000) }, // Fixed output
    { address: 'sys1q...', value: new BN(100000), subtractFeeFrom: true }, // Subtract fee from this
    { address: 'sys1q...', value: new BN(150000), subtractFeeFrom: true } // And this
  ]

  const feeRate = new BN(10)

  const { inputs, outputs: resultOutputs, fee } = coinSelect(utxos, [], outputs, feeRate)

  t.equal(inputs.length, 2, 'should use all inputs')
  t.equal(resultOutputs.length, 3, 'should have three outputs')
  t.equal(resultOutputs[0].value.toString(), '50000', 'fixed output should keep its value')
  t.ok(!resultOutputs[1].subtractFeeFrom, 'subtractFeeFrom flag should be removed from first marked output')
  t.ok(!resultOutputs[2].subtractFeeFrom, 'subtractFeeFrom flag should be removed from second marked output')

  // Fee should be distributed across outputs marked for subtraction
  const totalOriginal = new BN(100000).add(new BN(150000))
  const totalAfterFee = resultOutputs[1].value.add(resultOutputs[2].value)
  t.equal(totalOriginal.sub(totalAfterFee).toString(), fee.toString(), 'fee should be subtracted from marked outputs')
})

test('subtract fee - insufficient funds', function (t) {
  t.plan(1)

  const utxos = [
    { txId: '0000000000000000000000000000000000000000000000000000000000000000', vout: 0, value: new BN(1000) }
  ]

  const outputs = [
    { address: 'sys1q...', value: new BN(5000), subtractFeeFrom: true }
  ]

  const feeRate = new BN(100) // High fee rate

  const result = coinSelect(utxos, [], outputs, feeRate)

  t.equal(result.fee && result.fee.toNumber() > 0 && !result.inputs, true, 'should return fee only when output value would go below dust')
})

test('max send emulation', function (t) {
  t.plan(4)

  const utxos = [
    { txId: '0000000000000000000000000000000000000000000000000000000000000000', vout: 0, value: new BN(10000) },
    { txId: '0000000000000000000000000000000000000000000000000000000000000001', vout: 0, value: new BN(20000) },
    { txId: '0000000000000000000000000000000000000000000000000000000000002', vout: 0, value: new BN(30000) }
  ]

  // To emulate max send, set output value to total UTXOs value
  const totalValue = utxos.reduce((sum, utxo) => sum.add(utxo.value), new BN(0))
  const outputs = [
    { address: 'sys1q...', value: totalValue, subtractFeeFrom: true }
  ]

  const feeRate = new BN(10)

  const { inputs, outputs: resultOutputs, fee } = coinSelect(utxos, [], outputs, feeRate)

  t.equal(inputs.length, 3, 'should use all inputs')
  t.equal(resultOutputs.length, 1, 'should have single output')

  // Verify it behaves like max send
  const totalInputs = inputs.reduce((sum, input) => sum.add(input.value), new BN(0))
  t.equal(resultOutputs[0].value.toString(), totalInputs.sub(fee).toString(), 'output should be total inputs minus fee')
  t.equal(resultOutputs[0].subtractFeeFrom, undefined, 'subtractFeeFrom flag should be removed')
})

test('subtract fee removes output when it falls below dust', function (t) {
  t.plan(3)

  const utxos = [
    { txId: '0000000000000000000000000000000000000000000000000000000000000000', vout: 0, value: new BN(100000) }
  ]

  const feeRate = new BN(10)
  // Calculate dust threshold for a BECH32 output (default type)
  const dustThreshold = new BN(68).mul(feeRate) // inputBytes for BECH32 * feeRate

  const outputs = [
    { address: 'sys1q...', value: new BN(50000) }, // Regular output
    { address: 'sys1q...', value: dustThreshold.add(new BN(100)), subtractFeeFrom: true }, // Will fall below dust after fee deduction
    { address: 'sys1q...', value: new BN(30000), subtractFeeFrom: true } // Should have remaining fee deducted
  ]

  const { inputs, outputs: resultOutputs } = coinSelect(utxos, [], outputs, feeRate)

  t.equal(inputs.length, 1, 'should use input')
  t.equal(resultOutputs.length, 2, 'should remove output that falls below dust')
  t.equal(resultOutputs[0].value.toString(), '50000', 'regular output should keep its value')
})
