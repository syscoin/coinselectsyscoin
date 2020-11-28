const tape = require('tape')
const utils = require('../utils')
const BN = require('bn.js')
const ext = require('../bn-extensions')

tape('utils', function (t) {
  t.test('uintOrNull', function (t) {
    t.plan(8)
    t.ok(utils.uintOrNull(new BN(1)).cmp(ext.BN_ONE) === 0)
    t.equal(!utils.uintOrNull(''), true)
    t.equal(!utils.uintOrNull(Infinity), true)
    t.equal(!utils.uintOrNull(NaN), true)
    t.equal(!utils.uintOrNull('1'), true)
    t.equal(!utils.uintOrNull('1.1'), true)
    t.equal(!utils.uintOrNull(1.1), true)
    t.equal(!utils.uintOrNull(-1), true)
    t.end()
  })
})
tape('auxfee', function (t) {
  const auxfeedetails = {}
  auxfeedetails.auxfees = []
  const scalarPct = 1000
  const COIN = 100000000
  auxfeedetails.auxfees.push({ bound: 0, percent: 1 * scalarPct })
  auxfeedetails.auxfees.push({ bound: 10 * COIN, percent: 0.4 * scalarPct })
  auxfeedetails.auxfees.push({ bound: 250 * COIN, percent: 0.2 * scalarPct })
  auxfeedetails.auxfees.push({ bound: 2500 * COIN, percent: 0.07 * scalarPct })
  auxfeedetails.auxfees.push({ bound: 25000 * COIN, percent: 0.007 * scalarPct })
  auxfeedetails.auxfees.push({ bound: 250000 * COIN, percent: 0 })
  const auxfee = utils.getAuxFee(auxfeedetails, 250 * COIN)
  t.same(auxfee, new BN(1.06 * COIN))
  t.end()
})
