import { describe, expect, it } from 'vitest'
import {
  allocateContribution,
  allocateStartingBalance,
  applyPortfolioCashflow,
  applySleeveReturns,
  rebalanceToTargetWeights,
  type PortfolioSleeve,
} from './portfolioAllocation'

const sleeves: PortfolioSleeve[] = [
  { id: 'equities', currentWeightPercent: 70, targetWeightPercent: 60 },
  { id: 'bonds', currentWeightPercent: 30, targetWeightPercent: 30 },
  { id: 'cash', currentWeightPercent: 0, targetWeightPercent: 10 },
]

describe('portfolio allocation', () => {
  it('allocates the starting balance using normalized current weights', () => {
    expect(allocateStartingBalance(1_000, sleeves)).toEqual({
      equities: 700,
      bonds: 300,
      cash: 0,
    })
  })

  it('allocates contributions using normalized target weights', () => {
    const allocation = allocateContribution(101, sleeves)

    expect(allocation.equities).toBeCloseTo(60.6, 10)
    expect(allocation.bonds).toBeCloseTo(30.3, 10)
    expect(allocation.cash).toBeCloseTo(10.1, 10)
    expect(Object.values(allocation).reduce((sum, amount) => sum + amount, 0)).toBe(101)
  })

  it('normalizes weights that do not total 100 and conserves the allocated amount', () => {
    const allocation = allocateStartingBalance(123.45, [
      { id: 'first', currentWeightPercent: 2, targetWeightPercent: 0 },
      { id: 'second', currentWeightPercent: 1, targetWeightPercent: 0 },
    ])

    expect(allocation.first).toBeCloseTo(82.3, 10)
    expect(allocation.second).toBeCloseTo(41.15, 10)
    expect(Object.values(allocation).reduce((sum, amount) => sum + amount, 0)).toBe(123.45)
  })

  it('uses equal shares for all-zero weights and safely handles a zero amount', () => {
    const noWeights = sleeves.map((sleeve) => ({ ...sleeve, currentWeightPercent: 0 }))

    expect(allocateStartingBalance(90, noWeights)).toEqual({
      equities: 30,
      bonds: 30,
      cash: 30,
    })
    expect(allocateContribution(0, sleeves)).toEqual({ equities: 0, bonds: 0, cash: 0 })
    expect(allocateStartingBalance(100, [])).toEqual({})
  })

  it('applies returns independently and leaves sleeves with omitted returns unchanged', () => {
    expect(applySleeveReturns(
      { equities: 1_000, bonds: 500, cash: 100 },
      { equities: 0.1, bonds: -0.2 },
    )).toEqual({ equities: 1_100, bonds: 400, cash: 100 })
  })

  it('allocates positive cash flow to target weights and withdraws pro rata without going below zero', () => {
    expect(applyPortfolioCashflow({ equities: 700, bonds: 300 }, 100, sleeves)).toEqual({
      equities: 760,
      bonds: 330,
      cash: 10,
    })
    expect(applyPortfolioCashflow({ equities: 800, bonds: 200 }, -500, sleeves)).toEqual({
      equities: 400,
      bonds: 100,
    })
    expect(applyPortfolioCashflow({ equities: 800, bonds: 200 }, -1_500, sleeves)).toEqual({
      equities: 0,
      bonds: 0,
    })
  })

  it('supports a total loss and a zero balance when applying returns', () => {
    expect(applySleeveReturns({ equities: 100, cash: 0 }, { equities: -1 })).toEqual({
      equities: 0,
      cash: 0,
    })
  })

  it('does not rebalance when scheduled never, and monthly rebalances every projection month', () => {
    const balances = { equities: 800, bonds: 200, cash: 0 }
    expect(rebalanceToTargetWeights(balances, sleeves, 'never', 1)).toEqual(balances)
    expect(rebalanceToTargetWeights(balances, sleeves, 'monthly', 1)).toEqual({
      equities: 600,
      bonds: 300,
      cash: 100,
    })
  })

  it('rebalances annually only on multiples of 12, with month 1 as the first projection month', () => {
    const balances = { equities: 800, bonds: 200 }

    expect(rebalanceToTargetWeights(balances, sleeves, 'annually', 1)).toEqual(balances)
    expect(rebalanceToTargetWeights(balances, sleeves, 'annually', 11)).toEqual(balances)
    expect(rebalanceToTargetWeights(balances, sleeves, 'annually', 12)).toEqual({
      equities: 600,
      bonds: 300,
      cash: 100,
    })
    expect(rebalanceToTargetWeights(balances, sleeves, 'annually', 24)).toEqual({
      equities: 600,
      bonds: 300,
      cash: 100,
    })
  })

  it('preserves total value when rebalancing to all-zero target weights', () => {
    const noTargets = sleeves.map((sleeve) => ({ ...sleeve, targetWeightPercent: 0 }))
    const rebalanced = rebalanceToTargetWeights({ equities: 75, bonds: 25 }, noTargets, 'monthly', 1)

    expect(rebalanced.equities).toBeCloseTo(100 / 3, 10)
    expect(rebalanced.bonds).toBeCloseTo(100 / 3, 10)
    expect(rebalanced.cash).toBeCloseTo(100 / 3, 10)
    expect(Object.values(rebalanced).reduce((sum, amount) => sum + amount, 0)).toBe(100)
  })

  it('keeps zero-value portfolios at zero through a scheduled rebalance', () => {
    expect(rebalanceToTargetWeights({}, sleeves, 'monthly', 1)).toEqual({
      equities: 0,
      bonds: 0,
      cash: 0,
    })
  })

  it('validates invalid weights, amounts, returns, and projection months', () => {
    expect(() => allocateStartingBalance(1, [
      { id: 'bad', currentWeightPercent: -1, targetWeightPercent: 0 },
    ])).toThrow(RangeError)
    expect(() => allocateContribution(-1, sleeves)).toThrow(RangeError)
    expect(() => allocateStartingBalance(1, [
      { id: 'same', currentWeightPercent: 1, targetWeightPercent: 1 },
      { id: 'same', currentWeightPercent: 1, targetWeightPercent: 1 },
    ])).toThrow(TypeError)
    expect(() => applySleeveReturns({ equities: 100 }, { equities: -1.1 })).toThrow(RangeError)
    expect(() => rebalanceToTargetWeights({}, sleeves, 'monthly', 0)).toThrow(RangeError)
  })
})
