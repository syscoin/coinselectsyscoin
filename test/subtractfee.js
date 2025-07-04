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

  // When output value > input value, should return INSUFFICIENT_FUNDS error
  // even with subtractFeeFrom (can't create value from nothing)
  t.equal(result.error, 'INSUFFICIENT_FUNDS', 'should return INSUFFICIENT_FUNDS when output > input')
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

test('max send with high fee rate and detrimental UTXOs', function (t) {
  t.plan(6)

  // Real-world scenario: mix of large and small UTXOs
  // At high fee rates, small UTXOs become detrimental (fee > value)
  // but MAX send should still work by using ALL UTXOs
  const utxos = [
    { txId: '0000000000000000000000000000000000000000000000000000000000000000', vout: 0, value: new BN(47457330) }, // Large UTXO
    { txId: '0000000000000000000000000000000000000000000000000000000000000001', vout: 0, value: new BN(1000000) },
    { txId: '0000000000000000000000000000000000000000000000000000000000000002', vout: 0, value: new BN(1000000) },
    { txId: '0000000000000000000000000000000000000000000000000000000000000003', vout: 0, value: new BN(998530) },
    { txId: '0000000000000000000000000000000000000000000000000000000000000004', vout: 0, value: new BN(95020) },
    { txId: '0000000000000000000000000000000000000000000000000000000000000005', vout: 0, value: new BN(19290) }, // Detrimental at 527 sat/byte
    { txId: '0000000000000000000000000000000000000000000000000000000000000006', vout: 0, value: new BN(10000) } // Detrimental at 527 sat/byte
  ]

  const totalValue = utxos.reduce((sum, utxo) => sum.add(utxo.value), new BN(0))

  // MAX send: output value = total UTXO value, subtract fees from output
  const outputs = [
    { address: 'sys1qmd75mjpknw3zywfrd3zypq6awl6uumu5jnzvf3', value: totalValue, subtractFeeFrom: true }
  ]

  // High fee rate that makes small UTXOs detrimental (fee > UTXO value)
  const feeRate = new BN(527) // 527 sat/byte - this was the failing case

  const result = coinSelect(utxos, [], outputs, feeRate)

  // Should NOT fail with INSUFFICIENT_FUNDS despite detrimental UTXOs
  t.ok(result.inputs, 'should return inputs')
  t.ok(result.outputs, 'should return outputs')
  t.equal(result.error, undefined, 'should not have error')

  // Should use ALL UTXOs including detrimental ones (this is the key fix)
  t.equal(result.inputs.length, utxos.length, 'should use all UTXOs including detrimental ones')

  // Should have single output with fee subtracted
  t.equal(result.outputs.length, 1, 'should have single output')

  // Verify math: output value should be total inputs minus fee
  const totalInputs = result.inputs.reduce((sum, input) => sum.add(input.value), new BN(0))
  const expectedOutputValue = totalInputs.sub(result.fee)
  t.equal(result.outputs[0].value.toString(), expectedOutputValue.toString(), 'output should be total inputs minus fee')
})

test('max send with reasonable fee rate for comparison', function (t) {
  t.plan(4)

  // Same UTXOs as above but with reasonable fee rate
  const utxos = [
    { txId: '0000000000000000000000000000000000000000000000000000000000000000', vout: 0, value: new BN(47457330) },
    { txId: '0000000000000000000000000000000000000000000000000000000000000001', vout: 0, value: new BN(1000000) },
    { txId: '0000000000000000000000000000000000000000000000000000000000000002', vout: 0, value: new BN(1000000) },
    { txId: '0000000000000000000000000000000000000000000000000000000000000003', vout: 0, value: new BN(998530) },
    { txId: '0000000000000000000000000000000000000000000000000000000000000004', vout: 0, value: new BN(95020) },
    { txId: '0000000000000000000000000000000000000000000000000000000000000005', vout: 0, value: new BN(19290) },
    { txId: '0000000000000000000000000000000000000000000000000000000000000006', vout: 0, value: new BN(10000) }
  ]

  const totalValue = utxos.reduce((sum, utxo) => sum.add(utxo.value), new BN(0))
  const outputs = [
    { address: 'sys1qmd75mjpknw3zywfrd3zypq6awl6uumu5jnzvf3', value: totalValue, subtractFeeFrom: true }
  ]

  const feeRate = new BN(10) // Reasonable fee rate - all UTXOs are profitable

  const result = coinSelect(utxos, [], outputs, feeRate)

  t.equal(result.inputs.length, utxos.length, 'should use all UTXOs')
  t.equal(result.outputs.length, 1, 'should have single output')

  // Verify math
  const totalInputs = result.inputs.reduce((sum, input) => sum.add(input.value), new BN(0))
  const expectedOutputValue = totalInputs.sub(result.fee)
  t.equal(result.outputs[0].value.toString(), expectedOutputValue.toString(), 'output should be total inputs minus fee')

  // Fee should be much lower than the high fee rate case
  t.ok(result.fee.lt(new BN(100000)), 'fee should be reasonable (< 100k sats)')
})
