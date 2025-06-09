const BN = require('bn.js')

module.exports = [{
  description: '1 to 3',
  feeRate: new BN(10),
  inputs: [
    new BN(18000)
  ],
  outputs: [{},
    {},
    {}
  ],
  expected: {
    inputs: [{
      value: new BN(18000)
    }],
    outputs: [{
      value: new BN(5133)
    },
    {
      value: new BN(5133)
    },
    {
      value: new BN(5133)
    }
    ],
    fee: new BN(2601)
  }
},
{
  description: '5 to 2',
  feeRate: new BN(10),
  inputs: [
    new BN(10000),
    new BN(10000),
    new BN(10000),
    new BN(10000),
    new BN(10000)
  ],
  outputs: [{},
    {}
  ],
  expected: {
    inputs: [{
      value: new BN(10000)
    },
    {
      value: new BN(10000)
    },
    {
      value: new BN(10000)
    },
    {
      value: new BN(10000)
    },
    {
      value: new BN(10000)
    }
    ],
    outputs: [{
      value: new BN(20930)
    },
    {
      value: new BN(20930)
    }
    ],
    fee: new BN(8140)
  }
},
{
  description: '3 to 1',
  feeRate: new BN(10),
  inputs: [
    new BN(10000),
    new BN(10000),
    new BN(10000)
  ],
  outputs: [{}],
  expected: {
    inputs: [{
      value: new BN(10000)
    },
    {
      value: new BN(10000)
    },
    {
      value: new BN(10000)
    }
    ],
    outputs: [{
      value: new BN(25140)
    }],
    fee: new BN(4860)
  }
},
{
  description: '3 to 3 (1 output pre-defined)',
  feeRate: new BN(10),
  inputs: [
    new BN(10000),
    new BN(10000),
    new BN(10000)
  ],
  outputs: [{
    address: 'foobar',
    value: new BN(12000)
  },
  {
    address: 'fizzbuzz'
  },
  {}
  ],
  expected: {
    inputs: [{
      value: new BN(10000)
    },
    {
      value: new BN(10000)
    },
    {
      value: new BN(10000)
    }
    ],
    outputs: [{
      address: 'foobar',
      value: new BN(12000)
    },
    {
      address: 'fizzbuzz',
      value: new BN(6230)
    },
    {
      value: new BN(6230)
    }
    ],
    fee: new BN(5540)
  }
},
{
  description: '2 to 0 (no result)',
  feeRate: new BN(10),
  inputs: [
    new BN(10000),
    new BN(10000)
  ],
  outputs: [],
  expected: {
    fee: new BN(3050),
    error: 'INSUFFICIENT_FUNDS'
  }
},
{
  description: '0 to 2 (no result)',
  feeRate: new BN(10),
  inputs: [],
  outputs: [{},
    {}
  ],
  expected: {
    fee: new BN(790),
    error: 'INSUFFICIENT_FUNDS'
  }
},
{
  description: '1 to 2, output is dust (no result)',
  feeRate: new BN(10),
  inputs: [
    new BN(2000)
  ],
  outputs: [{}],
  expected: {
    fee: new BN(1920),
    error: 'INSUFFICIENT_FUNDS'
  }
},
{
  description: '2 outputs, some with missing value (NaN)',
  feeRate: new BN(11),
  inputs: [
    new BN(20000)
  ],
  outputs: [{
    value: new BN(4000)
  },
  {}
  ],
  expected: {
    inputs: [{
      value: new BN(20000)
    }],
    outputs: [{
      value: new BN(4000)
    },
    {
      value: new BN(13514)
    }
    ],
    fee: new BN(2486)
  }
},

// TODO
{
  description: '2 outputs, some with float values (NaN)',
  feeRate: new BN(10),
  inputs: [
    new BN(20000)
  ],
  outputs: [{
    value: 4000.5
  },
  {}
  ],
  expected: {
    fee: new BN(2260),
    error: 'INVALID_AMOUNT'
  }
},

{
  description: '2 outputs, string values (NaN)',
  feeRate: new BN(11),
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
    fee: new BN(2486),
    error: 'INVALID_AMOUNT'
  }
},
{
  description: 'input with float values (NaN)',
  feeRate: new BN(10),
  inputs: [
    20000.5
  ],
  outputs: [{},
    {}
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
  outputs: [{}],
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
  outputs: [{}],
  expected: {
    error: 'INVALID_FEE_RATE'
  }
}
]
