var BN = require('bn.js')

module.exports = [{
  description: '3 asset outputs with different guids, no asset change',
  feeRate: new BN(10),
  isNonAssetFunded: false,
  assetMap: [
    [1234, { changeAddress: 'changeAddr1', outputs: [{ value: 100, address: 'addr1' }] }],
    [12345, { changeAddress: 'changeAddr2', outputs: [{ value: 1000, address: 'addr2' }] }],
    [12346, { changeAddress: 'changeAddr3', outputs: [{ value: 10000, address: 'addr3' }] }]
  ],
  utxos: [
    { value: new BN(102001) },
    { assetInfo: { assetGuid: 1234, value: 100 }, value: new BN(980) },
    { assetInfo: { assetGuid: 12345, value: 1000 }, value: new BN(980) },
    { assetInfo: { assetGuid: 12346, value: 10000 }, value: new BN(980) }
  ],
  expected: {
    inputs: [
      {
        i: 1,
        assetInfo: { assetGuid: 1234, value: 100 },
        value: new BN(980)
      },
      {
        i: 2,
        assetInfo: { assetGuid: 12345, value: 1000 },
        value: new BN(980)
      },
      {
        i: 3,
        assetInfo: { assetGuid: 12346, value: 10000 },
        value: new BN(980)
      }],
    outputs: [
      {
        assetInfo: { assetGuid: 1234, value: 100 },
        value: new BN(980)
      },
      {
        assetInfo: { assetGuid: 12345, value: 1000 },
        value: new BN(980)
      },
      {
        assetInfo: { assetGuid: 12346, value: 10000 },
        value: new BN(980)
      }],
    fee: new BN(2001)
  }
}
]
