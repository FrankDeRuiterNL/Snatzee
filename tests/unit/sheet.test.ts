import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  emptySheet,
  isValidSheet,
  sheetTotals,
  yahtzeeBonus,
  TOPSCORE_ROW,
} from '@/lib/scoresheet/sheet'

// Every box filled: upper 105 (+35 bonus), lower 205.
const FULL = [5, 10, 15, 20, 25, 30, 20, 20, 25, 30, 40, 50, 20]

test('an empty sheet is valid and adds up to zero', () => {
  const sheet = emptySheet()
  assert.equal(isValidSheet(sheet), true)
  assert.equal(sheetTotals(sheet).total, 0)
})

test('the upper bonus starts at 63', () => {
  const at62 = [2, 4, 6, 16, 10, 24, 0, 0, 0, 0, 0, 0, 0]
  const at63 = [3, 4, 6, 16, 10, 24, 0, 0, 0, 0, 0, 0, 0]
  assert.equal(sheetTotals(at62).bonus, 0)
  assert.equal(sheetTotals(at63).bonus, 35)
  assert.equal(sheetTotals(at63).total, 98)
})

test('a full sheet without extra Yahtzees', () => {
  const totals = sheetTotals(FULL)
  assert.deepEqual(
    { subtotal: totals.subtotal, bonus: totals.bonus, lower: totals.lower, total: totals.total },
    { subtotal: 105, bonus: 35, lower: 205, total: 345 },
  )
})

test('every Yahtzee after the first is worth 100', () => {
  assert.equal(sheetTotals(FULL, 1).total, 345)
  assert.equal(sheetTotals(FULL, 3).total, 545)
  assert.equal(yahtzeeBonus(FULL, 3), 200)
})

test('no Yahtzee bonus when the Yahtzee box was scratched', () => {
  const scratched = FULL.map((value, row) => (row === TOPSCORE_ROW ? 0 : value))
  assert.equal(yahtzeeBonus(scratched, 4), 0)
})

test('values a row cannot hold are rejected', () => {
  assert.equal(isValidSheet([...FULL.slice(0, 12), 3]), false, 'chance below 5')
  assert.equal(isValidSheet(FULL.map((v, row) => (row === 1 ? 3 : v))), false, 'odd twos')
  assert.equal(isValidSheet(FULL.slice(0, 12)), false, 'twelve rows')
  assert.equal(isValidSheet('nope'), false)
})
