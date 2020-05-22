var BN = require('bn.js')

module.exports = [{
  description: '3 asset outputs with different guids, no asset change',
  feeRate: new BN(10),
  isNonAssetFunded: false,
  assetMap: new Map([
    [1234, { changeAddress: 'changeAddr1', outputs: [{ value: new BN(100), address: 'addr1' }] }],
    [12345, { changeAddress: 'changeAddr2', outputs: [{ value: new BN(1000), address: 'addr2' }] }],
    [12346, { changeAddress: 'changeAddr3', outputs: [{ value: new BN(10000), address: 'addr3' }] }]
  ]),
  utxos: [
    { value: new BN(102001) },
    { assetInfo: { assetGuid: 1234, value: new BN(100) }, value: new BN(690) },
    { assetInfo: { assetGuid: 12345, value: new BN(1000) }, value: new BN(690) },
    { assetInfo: { assetGuid: 12346, value: new BN(10000) }, value: new BN(690) }
  ],
  expected: {
    inputs: [
      {
        i: 1,
        assetInfo: { assetGuid: 1234, value: new BN(100) },
        value: new BN(690)
      },
      {
        i: 2,
        assetInfo: { assetGuid: 12345, value: new BN(1000) },
        value: new BN(690)
      },
      {
        i: 3,
        assetInfo: { assetGuid: 12346, value: new BN(10000) },
        value: new BN(690)
      }],
    outputs: [
      {
        address: 'addr1',
        type: 'BECH32',
        assetInfo: { assetGuid: 1234, value: new BN(100) },
        value: new BN(690)
      },
      {
        address: 'addr2',
        type: 'BECH32',
        assetInfo: { assetGuid: 12345, value: new BN(1000) },
        value: new BN(690)
      },
      {
        address: 'addr3',
        type: 'BECH32',
        assetInfo: { assetGuid: 12346, value: new BN(10000) },
        value: new BN(690)
      }]
  }
}
]
