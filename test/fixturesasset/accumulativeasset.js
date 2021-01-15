const BN = require('bn.js')
const utils = require('../utils')

module.exports = [{
  description: '3 asset outputs with different guids, no asset change',
  feeRate: new BN(10),
  txVersion: utils.SYSCOIN_TX_VERSION_ASSET_SEND,
  assetMap: new Map([
    [new BN(1234), { changeAddress: 'changeAddr1', outputs: [{ value: new BN(100), address: 'addr1' }] }],
    [new BN(12345), { changeAddress: 'changeAddr2', outputs: [{ value: new BN(1000), address: 'addr2' }] }],
    [new BN(12346), { changeAddress: 'changeAddr3', outputs: [{ value: new BN(10000), address: 'addr3' }] }]
  ]),
  utxos: [
    { value: new BN(102001) },
    { assetInfo: { assetGuid: new BN(1234), value: new BN(100) }, value: new BN(690) },
    { assetInfo: { assetGuid: new BN(12345), value: new BN(1000) }, value: new BN(690) },
    { assetInfo: { assetGuid: new BN(12346), value: new BN(10000) }, value: new BN(690) }
  ],
  expected: {
    inputs: [
      {
        i: 1,
        assetInfo: { assetGuid: new BN(1234), value: new BN(100) },
        value: new BN(690)
      },
      {
        i: 2,
        assetInfo: { assetGuid: new BN(12345), value: new BN(1000) },
        value: new BN(690)
      },
      {
        i: 3,
        assetInfo: { assetGuid: new BN(12346), value: new BN(10000) },
        value: new BN(690)
      }],
    outputs: [
      {

        address: 'addr1',
        type: 'BECH32',
        assetInfo: { assetGuid: new BN(1234), value: new BN(100) },
        value: new BN(690)
      },
      {

        address: 'addr2',
        type: 'BECH32',
        assetInfo: { assetGuid: new BN(12345), value: new BN(1000) },
        value: new BN(690)
      },
      {

        address: 'addr3',
        type: 'BECH32',
        assetInfo: { assetGuid: new BN(12346), value: new BN(10000) },
        value: new BN(690)
      }]
  }
},
{
  description: 'multiple asset outputs per asset with multiple change, out of order utxo',
  feeRate: new BN(10),
  txVersion: utils.SYSCOIN_TX_VERSION_ASSET_SEND,
  assetMap: new Map([
    [new BN(1234), { changeAddress: 'changeAddr1', outputs: [{ value: new BN(100), address: 'addr1' }, { value: new BN(50), address: 'addr1a' }] }],
    [new BN(12345), { changeAddress: 'changeAddr2', outputs: [{ value: new BN(1000), address: 'addr2' }, { value: new BN(100), address: 'addr2a' }, { value: new BN(10), address: 'addr2b' }] }],
    [new BN(12346), { changeAddress: 'changeAddr3', outputs: [{ value: new BN(10000), address: 'addr3' }, { value: new BN(100000), address: 'addr3a' }] }]
  ]),
  utxos: [
    { value: new BN(102001) },
    { assetInfo: { assetGuid: new BN(1234), value: new BN(10) }, value: new BN(690) },
    { assetInfo: { assetGuid: new BN(1234), value: new BN(100) }, value: new BN(690) },
    { assetInfo: { assetGuid: new BN(1234), value: new BN(25) }, value: new BN(690) },
    { assetInfo: { assetGuid: new BN(1234), value: new BN(35) }, value: new BN(690) },
    { assetInfo: { assetGuid: new BN(12345), value: new BN(2000) }, value: new BN(690) },
    { assetInfo: { assetGuid: new BN(12346), value: new BN(10000) }, value: new BN(690) },
    { assetInfo: { assetGuid: new BN(12346), value: new BN(100000) }, value: new BN(690) }
  ],
  expected: {
    inputs: [
      {
        i: 2,
        assetInfo: { assetGuid: new BN(1234), value: new BN(100) },
        value: new BN(690)
      },
      {
        i: 4,
        assetInfo: { assetGuid: new BN(1234), value: new BN(35) },
        value: new BN(690)
      },
      {
        i: 3,
        assetInfo: { assetGuid: new BN(1234), value: new BN(25) },
        value: new BN(690)
      },
      {
        i: 5,
        assetInfo: { assetGuid: new BN(12345), value: new BN(2000) },
        value: new BN(690)
      },
      {
        i: 7,
        assetInfo: { assetGuid: new BN(12346), value: new BN(100000) },
        value: new BN(690)
      },
      {
        i: 6,
        assetInfo: { assetGuid: new BN(12346), value: new BN(10000) },
        value: new BN(690)
      }],
    outputs: [
      {

        address: 'addr1',
        type: 'BECH32',
        assetInfo: { assetGuid: new BN(1234), value: new BN(100) },
        value: new BN(690)
      },
      {

        address: 'addr1a',
        type: 'BECH32',
        assetInfo: { assetGuid: new BN(1234), value: new BN(50) },
        value: new BN(690)
      },
      // changeAddr1
      {
        assetChangeIndex: 2,
        type: 'BECH32',
        assetInfo: { assetGuid: new BN(1234), value: new BN(10) },
        value: new BN(690)
      },
      {

        address: 'addr2',
        type: 'BECH32',
        assetInfo: { assetGuid: new BN(12345), value: new BN(1000) },
        value: new BN(690)
      },
      {

        address: 'addr2a',
        type: 'BECH32',
        assetInfo: { assetGuid: new BN(12345), value: new BN(100) },
        value: new BN(690)
      },
      {

        address: 'addr2b',
        type: 'BECH32',
        assetInfo: { assetGuid: new BN(12345), value: new BN(10) },
        value: new BN(690)
      },
      // changeAddr2
      {
        assetChangeIndex: 3,
        type: 'BECH32',
        assetInfo: { assetGuid: new BN(12345), value: new BN(890) },
        value: new BN(690)
      },
      {

        address: 'addr3',
        type: 'BECH32',
        assetInfo: { assetGuid: new BN(12346), value: new BN(10000) },
        value: new BN(690)
      },
      {

        address: 'addr3a',
        type: 'BECH32',
        assetInfo: { assetGuid: new BN(12346), value: new BN(100000) },
        value: new BN(690)
      }]
  }
}
]
