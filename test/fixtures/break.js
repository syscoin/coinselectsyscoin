const BN = require('bn.js')

module.exports = [{
  description: '1:1, no remainder',
  feeRate: new BN(10),
  inputs: [
    new BN(11920)
  ],
  output: new BN(10000),
  expected: {
    inputs: [{
      value: new BN(11920)
    }],
    outputs: [{
      value: new BN(10000)
    }],
    fee: new BN(1920)
  }
},
{
  description: '1:1',
  feeRate: new BN(10),
  inputs: [
    new BN(12000)
  ],
  output: {
    address: 'woop',
    value: new BN(10000)
  },
  expected: {
    fee: new BN(2000),
    inputs: [{
      value: new BN(12000)
    }],
    outputs: [{
      address: 'woop',
      value: new BN(10000)
    }]
  }
},
{
  description: '1:1, w/ change',
  feeRate: new BN(10),
  inputs: [
    new BN(12000)
  ],
  output: new BN(8000),
  expected: {
    inputs: [{
      value: new BN(12000)
    }],
    outputs: [{
      value: new BN(8000)
    },
    {
      changeIndex: 1,
      value: new BN(1740)
    }
    ],
    fee: new BN(2260)
  }
},
{
  description: '1:4',
  feeRate: new BN(10),
  inputs: [
    new BN(12000)
  ],
  output: new BN(2000),
  expected: {
    inputs: [{
      value: new BN(12000)
    }],
    outputs: [{
      value: new BN(2000)
    },
    {
      value: new BN(2000)
    },
    {
      value: new BN(2000)
    },
    {
      value: new BN(2000)
    }
    ],
    fee: new BN(4000)
  }
},
{
  description: '2:5',
  feeRate: new BN(10),
  inputs: [
    new BN(3000),
    new BN(12000)
  ],
  output: new BN(2000),
  expected: {
    inputs: [{
      value: new BN(3000)
    },
    {
      value: new BN(12000)
    }
    ],
    outputs: [{
      value: new BN(2000)
    },
    {
      value: new BN(2000)
    },
    {
      value: new BN(2000)
    },
    {
      value: new BN(2000)
    },
    {
      value: new BN(2000)
    }
    ],
    fee: new BN(5000)
  }
},
{
  description: '2:5, no fee',
  feeRate: new BN(0),
  inputs: [
    new BN(5000),
    new BN(10000)
  ],
  output: new BN(3000),
  expected: {
    inputs: [{
      value: new BN(5000)
    },
    {
      value: new BN(10000)
    }
    ],
    outputs: [{
      value: new BN(3000)
    },
    {
      value: new BN(3000)
    },
    {
      value: new BN(3000)
    },
    {
      value: new BN(3000)
    },
    {
      value: new BN(3000)
    }
    ],
    fee: new BN(0)
  }
},
{
  description: '2:2 (+1), w/ change',
  feeRate: new BN(7),
  inputs: [
    new BN(16000)
  ],
  output: new BN(6000),
  expected: {
    inputs: [{
      value: new BN(16000)
    }],
    outputs: [{
      value: new BN(6000)
    },
    {
      value: new BN(6000)
    },
    {
      changeIndex: 2,
      value: new BN(2180)
    }
    ],
    fee: new BN(1820)
  }
},
{
  description: '2:3 (+1), no fee, w/ change',
  feeRate: new BN(0),
  inputs: [
    new BN(5000),
    new BN(10000)
  ],
  output: new BN(4000),
  expected: {
    inputs: [{
      value: new BN(5000)
    },
    {
      value: new BN(10000)
    }
    ],
    outputs: [{
      value: new BN(4000)
    },
    {
      value: new BN(4000)
    },
    {
      value: new BN(4000)
    },
    {
      changeIndex: 3,
      value: new BN(3000)
    }
    ],
    fee: new BN(0)
  }
},
{
  description: 'not enough funds',
  feeRate: new BN(10),
  inputs: [
    new BN(41000),
    new BN(1000)
  ],
  output: new BN(40000),
  expected: {
    error: 'INSUFFICIENT_FUNDS',
    fee: new BN(3390),
    shortfall: new BN(1390),
    details: {
      inputTotal: new BN(42000),
      outputTotal: new BN(40000),
      requiredFee: new BN(3390),
      message: 'Insufficient funds to create even one output'
    }
  }
},
{
  description: 'no inputs',
  feeRate: new BN(10),
  inputs: [],
  output: new BN(2000),
  expected: {
    error: 'INSUFFICIENT_FUNDS',
    fee: new BN(450),
    shortfall: new BN(2450),
    details: {
      inputTotal: new BN(0),
      outputTotal: new BN(2000),
      requiredFee: new BN(450),
      message: 'Insufficient funds to create even one output'
    }
  }
},
{
  description: 'invalid output (NaN)',
  feeRate: new BN(10),
  inputs: [],
  output: {},
  expected: {
    fee: new BN(110),
    error: 'INVALID_AMOUNT'
  }
},
{
  description: 'input with float values (NaN)',
  feeRate: new BN(10),
  inputs: [
    10000.5
  ],
  output: new BN(5000),
  expected: {
    fee: new BN(1580),
    error: 'INVALID_AMOUNT'
  }
},
{
  description: 'inputs and outputs, bad feeRate (NaN)',
  feeRate: '1',
  inputs: [
    new BN(20000)
  ],
  output: new BN(10000),
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
  output: new BN(10000),
  expected: {
    error: 'INVALID_FEE_RATE'
  }
}
]
