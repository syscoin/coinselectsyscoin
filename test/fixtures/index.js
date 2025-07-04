const BN = require('bn.js')

module.exports = [{
  description: '1 output, no change',
  feeRate: new BN(10),
  inputs: [
    new BN(102001)
  ],
  outputs: [
    new BN(100000)
  ],
  expected: {
    inputs: [{
      i: 0,
      value: new BN(102001)
    }],
    outputs: [{
      value: new BN(100000)
    }],
    fee: new BN(2001)
  }
},
{
  description: '1 output, change expected',
  feeRate: new BN(5),
  inputs: [
    new BN(106001)
  ],
  outputs: [
    new BN(100000)
  ],
  expected: {
    inputs: [{
      i: 0,
      value: new BN(106001)
    }],
    outputs: [{
      value: new BN(100000)
    },
    {
      changeIndex: 1,
      value: new BN(4851)
    }
    ],
    fee: new BN(1150)
  }
},
{
  description: '1 output, sub-optimal inputs (if re-ordered), direct possible',
  feeRate: new BN(10),
  inputs: [
    new BN(10000),
    new BN(40000),
    new BN(40000)
  ],
  outputs: [
    new BN(7700)
  ],
  expected: {
    inputs: [{
      i: 0,
      value: new BN(10000)
    }],
    outputs: [{
      value: new BN(7700)
    }],
    fee: new BN(2300)
  }
},
{
  description: '1 output, sub-optimal inputs (if re-ordered), direct possible, but slightly higher fee',
  feeRate: new BN(10),
  inputs: [
    new BN(10000),
    new BN(40000),
    new BN(40000)
  ],
  outputs: [
    new BN(6800)
  ],
  expected: {
    inputs: [{
      i: 0,
      value: new BN(10000)
    }],
    outputs: [{
      value: new BN(6800)
    }],
    fee: new BN(3200)
  }
},
{
  description: '1 output, sub-optimal inputs (if re-ordered, no direct possible), change expected',
  feeRate: new BN(5),
  inputs: [
    new BN(10000),
    new BN(40000),
    new BN(40000)
  ],
  outputs: [
    new BN(4700)
  ],
  expected: {
    inputs: [{
      i: 1,
      value: new BN(40000)
    }],
    outputs: [{
      value: new BN(4700)
    },
    {
      changeIndex: 1,
      value: new BN(34150)
    }
    ],
    fee: new BN(1150)
  }
},
{
  description: '1 output, optimal inputs, no change',
  feeRate: new BN(10),
  inputs: [
    new BN(10000)
  ],
  outputs: [
    new BN(7700)
  ],
  expected: {
    inputs: [{
      i: 0,
      value: new BN(10000)
    }],
    outputs: [{
      value: new BN(7700)
    }],
    fee: new BN(2300)
  }
},
{
  description: '1 output, no fee, change expected',
  feeRate: new BN(0),
  inputs: [
    new BN(5000),
    new BN(5000),
    new BN(5000),
    new BN(5000),
    new BN(5000),
    new BN(5000)
  ],
  outputs: [
    new BN(28000)
  ],
  expected: {
    inputs: [{
      i: 0,
      value: new BN(5000)
    },
    {
      i: 1,
      value: new BN(5000)
    },
    {
      i: 2,
      value: new BN(5000)
    },
    {
      i: 3,
      value: new BN(5000)
    },
    {
      i: 4,
      value: new BN(5000)
    },
    {
      i: 5,
      value: new BN(5000)
    }
    ],
    outputs: [{
      value: new BN(28000)
    },
    {
      changeIndex: 1,
      value: new BN(2000)
    }
    ],
    fee: new BN(0)
  }
},
{
  description: '1 output, 2 inputs (related), no change',
  feeRate: new BN(10),
  inputs: [{
    address: 'a',
    value: new BN(100000)
  },
  {
    address: 'a',
    value: new BN(2000)
  }
  ],
  outputs: [
    new BN(98000)
  ],
  expected: {
    inputs: [{
      i: 0,
      address: 'a',
      value: new BN(100000)
    }],
    outputs: [{
      value: new BN(98000)
    }],
    fee: new BN(2000)
  }
},
{
  description: 'many outputs, no change',
  feeRate: new BN(10),
  inputs: [
    new BN(30000),
    new BN(12220),
    new BN(10001)
  ],
  outputs: [
    new BN(35000),
    new BN(5000),
    new BN(5000),
    new BN(1000)
  ],
  expected: {
    inputs: [{
      i: 0,
      value: new BN(30000)
    },
    {
      i: 1,
      value: new BN(12220)
    },
    {
      i: 2,
      value: new BN(10001)
    }
    ],
    outputs: [{
      value: new BN(35000)
    },
    {
      value: new BN(5000)
    },
    {
      value: new BN(5000)
    },
    {
      value: new BN(1000)
    }
    ],
    fee: new BN(6221)
  }
},
{
  description: 'many outputs, change expected',
  feeRate: new BN(10),
  inputs: [
    new BN(30000),
    new BN(14220),
    new BN(10001)
  ],
  outputs: [
    new BN(35000),
    new BN(5000),
    new BN(5000),
    new BN(1000)
  ],
  expected: {
    inputs: [{
      i: 0,
      value: new BN(30000)
    },
    {
      i: 1,
      value: new BN(14220)
    },
    {
      i: 2,
      value: new BN(10001)
    }
    ],
    outputs: [{
      value: new BN(35000)
    },
    {
      value: new BN(5000)
    },
    {
      value: new BN(5000)
    },
    {
      value: new BN(1000)
    },
    {
      changeIndex: 4,
      value: new BN(1961)
    }
    ],
    fee: new BN(6260)
  }
},
{
  description: 'many outputs, no fee, change expected',
  feeRate: new BN(0),
  inputs: [
    new BN(5000),
    new BN(5000),
    new BN(5000),
    new BN(5000),
    new BN(5000),
    new BN(5000)
  ],
  outputs: [
    new BN(28000),
    new BN(1000)
  ],
  expected: {
    inputs: [{
      i: 0,
      value: new BN(5000)
    },
    {
      i: 1,
      value: new BN(5000)
    },
    {
      i: 2,
      value: new BN(5000)
    },
    {
      i: 3,
      value: new BN(5000)
    },
    {
      i: 4,
      value: new BN(5000)
    },
    {
      i: 5,
      value: new BN(5000)
    }
    ],
    outputs: [{
      value: new BN(28000)
    },
    {
      value: new BN(1000)
    },
    {
      changeIndex: 2,
      value: new BN(1000)
    }
    ],
    fee: new BN(0)
  }
},
{
  description: 'no outputs, no change',
  feeRate: new BN(10),
  inputs: [
    new BN(1900)
  ],
  outputs: [],
  expected: {
    inputs: [{
      i: 0,
      value: new BN(1900)
    }],
    outputs: [],
    fee: new BN(1900)
  }
},
{
  description: 'no outputs, change expected',
  feeRate: new BN(10),
  inputs: [
    new BN(20000)
  ],
  outputs: [],
  expected: {
    inputs: [{
      i: 0,
      value: new BN(20000)
    }],
    outputs: [{
      changeIndex: 0,
      value: new BN(18040)
    }],
    fee: new BN(1960)
  }
},
{
  description: 'not enough funds, empty result',
  feeRate: new BN(10),
  inputs: [
    new BN(20000)
  ],
  outputs: [
    new BN(40000)
  ],
  expected: {
    fee: new BN(1920),
    error: 'INSUFFICIENT_FUNDS',
    shortfall: new BN(21920),
    details: {
      inputTotal: new BN(20000),
      outputTotal: new BN(40000),
      requiredFee: new BN(1920),
      message: 'Not enough UTXOs to cover amount and fees'
    }
  }
},
{
  description: 'not enough funds (w/ fee), empty result',
  feeRate: new BN(10),
  inputs: [
    new BN(40000)
  ],
  outputs: [
    new BN(40000)
  ],
  expected: {
    fee: new BN(1920),
    error: 'INSUFFICIENT_FUNDS',
    shortfall: new BN(1920),
    details: {
      inputTotal: new BN(40000),
      outputTotal: new BN(40000),
      requiredFee: new BN(1920),
      message: 'Not enough UTXOs to cover amount and fees'
    }
  }
},
{
  description: 'not enough funds (no inputs), empty result',
  feeRate: new BN(10),
  inputs: [],
  outputs: [],
  expected: {
    fee: new BN(110),
    error: 'INSUFFICIENT_FUNDS',
    shortfall: new BN(110),
    details: {
      inputTotal: new BN(0),
      outputTotal: new BN(0),
      requiredFee: new BN(110),
      message: 'Not enough UTXOs to cover amount and fees'
    }
  }
},
{
  description: 'not enough funds (no inputs), empty result (>1KiB)',
  feeRate: new BN(10),
  inputs: [],
  outputs: [
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1),
    new BN(1)
  ],
  expected: {
    fee: new BN(9970),
    error: 'INSUFFICIENT_FUNDS',
    shortfall: new BN(9999),
    details: {
      inputTotal: new BN(0),
      outputTotal: new BN(29),
      requiredFee: new BN(9970),
      message: 'Not enough UTXOs to cover amount and fees'
    }
  }
},
{
  description: '2 outputs, some with missing value (NaN)',
  feeRate: new BN(10),
  inputs: [
    new BN(20000)
  ],
  outputs: [
    new BN(1000),
    {}
  ],
  expected: {
    fee: new BN(2260),
    error: 'INVALID_AMOUNT'
  }
},
{
  description: 'input with float values (NaN)',
  feeRate: new BN(10),
  inputs: [
    20000.5
  ],
  outputs: [
    10000,
    1200
  ],
  expected: {
    fee: new BN(2260),
    error: 'INVALID_AMOUNT'
  }
},
{
  description: '2 outputs, string values (NaN)',
  feeRate: new BN(10),
  inputs: [
    new BN(20000)
  ],
  outputs: [{
    value: '100'
  },
  {
    value: '204'
  }
  ],
  expected: {
    fee: new BN(2260),
    error: 'INVALID_AMOUNT'
  }
},
{
  description: 'inputs and outputs, bad feeRate (NaN)',
  feeRate: '1',
  inputs: [
    new BN(20000)
  ],
  outputs: [
    new BN(10000)
  ],
  expected: {
    error: 'INVALID_FEE_RATE'
  }
},
{
  description: 'inputs and outputs, bad feeRate (NaN)',
  feeRate: 1.5,
  inputs: [
    new BN(20000)
  ],
  outputs: [
    new BN(10000)
  ],
  expected: {
    error: 'INVALID_FEE_RATE'
  }
}
]
