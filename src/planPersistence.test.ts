import { describe, expect, it } from 'vitest'
import { DEFAULT_INPUTS, STORAGE_KEY } from './model'
import { createDefaultPlanInputs, loadSavedPlan, parsePlanInputs } from './planPersistence'

describe('plan persistence validation', () => {
  it('fills defaults for older plans, merges nested overrides, and ignores unknown fields', () => {
    const plan = parsePlanInputs({
      currentAge: 41,
      returnOverrides: { swr: 6 },
      unexpectedField: 'ignored',
    })

    expect(plan.currentAge).toBe(41)
    expect(plan.endAge).toBe(DEFAULT_INPUTS.endAge)
    expect(plan.returnOverrides).toEqual({ swr: 6, dividends: null, drawdown: null })
    expect('unexpectedField' in plan).toBe(false)
  })

  it('returns independent defaults for missing, invalid, and unavailable storage', () => {
    const storage = { getItem: () => null }
    const first = loadSavedPlan(storage)
    const second = loadSavedPlan(storage)
    first.returnOverrides.swr = 5
    first.irregularQuarterlyGross[0] = 1

    expect(second.returnOverrides.swr).toBeNull()
    expect(second.irregularQuarterlyGross[0]).toBe(DEFAULT_INPUTS.irregularQuarterlyGross[0])
    expect(loadSavedPlan({ getItem: () => '{broken' })).toEqual(createDefaultPlanInputs())
    expect(loadSavedPlan({ getItem: () => JSON.stringify({ currentAge: 'old' }) })).toEqual(createDefaultPlanInputs())
    expect(loadSavedPlan({ getItem: () => { throw new Error('storage unavailable') } })).toEqual(createDefaultPlanInputs())
  })

  it('parses a stored plan and keeps the storage key stable', () => {
    const plan = { ...DEFAULT_INPUTS, currentAge: 42 }
    const loaded = loadSavedPlan({ getItem: (key) => key === STORAGE_KEY ? JSON.stringify(plan) : null })

    expect(loaded.currentAge).toBe(42)
    expect(loaded.incomeStreams).toEqual([])
  })

  it('preserves valid negative returns and unrealized losses', () => {
    const plan = parsePlanInputs({
      nominalReturnPercent: -5,
      inflationPercent: -1,
      eurUnrealizedGain: -2_000,
      usdUnrealizedGain: -500,
      returnOverrides: { swr: -3 },
    })

    expect(plan.nominalReturnPercent).toBe(-5)
    expect(plan.inflationPercent).toBe(-1)
    expect(plan.eurUnrealizedGain).toBe(-2_000)
    expect(plan.usdUnrealizedGain).toBe(-500)
    expect(plan.returnOverrides.swr).toBe(-3)
  })

  it.each([
    [null, /plan.*object/],
    [[], /plan.*object/],
    [{ eurToRon: '4.9' }, /eurToRon.*finite number/],
    [{ currentAge: -1 }, /currentAge.*non-negative/],
    [{ nominalReturnPercent: -101 }, /nominalReturnPercent.*no lower than -100/],
    [{ inflationPercent: -100 }, /inflationPercent.*greater than -100/],
    [{ equityAllocationPercent: 101 }, /equityAllocationPercent.*\[0, 100\]/],
    [{ equityBondCorrelation: 1.1 }, /equityBondCorrelation.*\[-1, 1\]/],
    [{ monteCarloRuns: 20 }, /monteCarloRuns.*\[100, 10000\]/],
    [{ eurToRon: 0 }, /exchange rate/],
    [{ portfolioSetupMode: 'advanced' }, /portfolioSetupMode/],
    [{ irregularQuarterlyGross: [1, 2, 3] }, /irregularQuarterlyGross/],
    [{ returnOverrides: null }, /returnOverrides.*object/],
    [{ returnOverrides: { swr: 'high' } }, /returnOverrides\.swr/],
    [{ incomeStreams: [{ id: '', name: 'pension', monthlyAmount: 100, startAge: 60, endAge: null }] }, /incomeStreams\[0\]\.id/],
    [{ incomeStreams: 'none' }, /incomeStreams.*array/],
    [{ eurToRonObservationDate: 42 }, /eurToRonObservationDate/],
  ])('rejects malformed saved/imported plan data', (value, message) => {
    expect(() => parsePlanInputs(value)).toThrow(message)
  })
})
