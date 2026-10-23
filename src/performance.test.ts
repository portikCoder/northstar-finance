import { describe, expect, it } from 'vitest'
import { calculateTravelAllowance, DEFAULT_INPUTS, RETIREMENT_MODES } from './model'

describe('interactive calculation performance budget', () => {
  it('solves all three travel allowances in under one second', () => {
    const startedAt = performance.now()
    const allowances = RETIREMENT_MODES.map((mode) => calculateTravelAllowance(
      DEFAULT_INPUTS,
      1_500,
      mode,
      DEFAULT_INPUTS.travelDelayLimitMonths,
    ))
    const elapsedMs = performance.now() - startedAt

    expect(allowances.every(({ annualBudget }) => annualBudget !== null)).toBe(true)
    expect(elapsedMs).toBeLessThan(1_000)
  })
})
