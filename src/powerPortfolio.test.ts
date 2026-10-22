import { describe, expect, it } from 'vitest'
import { buildPowerPortfolioConfiguration, type PowerPortfolioInput } from './powerPortfolio'

const input: PowerPortfolioInput = {
  currentEquityAllocationPercent: 75,
  equityAllocationPercent: 40,
  equityNominalReturnPercent: 7,
  equityVolatilityPercent: 15,
  equityAnnualFeePercent: 0.2,
  equityDistributionYieldPercent: 1.9,
  bondNominalReturnPercent: 3,
  bondVolatilityPercent: 3,
  bondAnnualFeePercent: 0.1,
  bondDistributionYieldPercent: 3.2,
  equityBondCorrelation: -0.25,
}

describe('Power-user portfolio configuration', () => {
  it('builds sleeve weights, return assumptions, and symmetric correlations together', () => {
    const configuration = buildPowerPortfolioConfiguration(input)

    expect(configuration.sleeves).toEqual([
      {
        id: 'equities',
        currentWeightPercent: 75,
        targetWeightPercent: 40,
        nominalReturnPercent: 7,
        volatilityPercent: 15,
        annualFeePercent: 0.2,
        distributionYieldPercent: 1.9,
      },
      {
        id: 'bonds',
        currentWeightPercent: 25,
        targetWeightPercent: 60,
        nominalReturnPercent: 3,
        volatilityPercent: 3,
        annualFeePercent: 0.1,
        distributionYieldPercent: 3.2,
      },
    ])
    expect(configuration.correlations).toEqual({
      equities: { equities: 1, bonds: -0.25 },
      bonds: { equities: -0.25, bonds: 1 },
    })
  })

  it('bounds allocation and correlation inputs consistently', () => {
    const configuration = buildPowerPortfolioConfiguration({
      ...input,
      currentEquityAllocationPercent: 120,
      equityAllocationPercent: -10,
      equityBondCorrelation: 1.5,
    })

    expect(configuration.sleeves.map(({ currentWeightPercent, targetWeightPercent }) => [
      currentWeightPercent,
      targetWeightPercent,
    ])).toEqual([[100, 0], [0, 100]])
    expect(configuration.correlations.equities.bonds).toBe(1)
    expect(configuration.correlations.bonds.equities).toBe(1)
  })
})
