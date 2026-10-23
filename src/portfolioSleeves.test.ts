import { describe, expect, it } from 'vitest'
import {
  calculatePortfolioSleeveAssumptions,
  type AssetSleeve,
} from './portfolioSleeves'

describe('portfolio sleeve assumptions', () => {
  it('returns zero assumptions for an empty portfolio', () => {
    expect(calculatePortfolioSleeveAssumptions([], {})).toEqual({
      weightedGrossNominalReturnPercent: 0,
      weightedAnnualFeePercent: 0,
      netNominalReturnPercent: 0,
      weightedCashDistributionYieldPercent: 0,
      volatilityPercent: 0,
    })
  })

  it('uses a single sleeve assumption regardless of the scale of its weight', () => {
    const sleeve: AssetSleeve = {
      id: 'equities',
      targetWeightPercent: 25,
      nominalReturnPercent: 7,
      volatilityPercent: 18,
      annualFeePercent: 0.2,
      distributionYieldPercent: 1.5,
    }

    expect(calculatePortfolioSleeveAssumptions([sleeve], {
      equities: { equities: 1 },
    })).toEqual({
      weightedGrossNominalReturnPercent: 7,
      weightedAnnualFeePercent: 0.2,
      netNominalReturnPercent: 6.8,
      weightedCashDistributionYieldPercent: 1.5,
      volatilityPercent: 18,
    })
  })

  it('normalizes weights and calculates two-sleeve volatility with correlation', () => {
    const sleeves: AssetSleeve[] = [
      {
        id: 'equities',
        targetWeightPercent: 3,
        nominalReturnPercent: 8,
        volatilityPercent: 10,
        annualFeePercent: 0.2,
        distributionYieldPercent: 2,
      },
      {
        id: 'bonds',
        targetWeightPercent: 2,
        nominalReturnPercent: 4,
        volatilityPercent: 5,
        annualFeePercent: 0.1,
        distributionYieldPercent: 3,
      },
    ]
    const assumptions = calculatePortfolioSleeveAssumptions(sleeves, {
      equities: { equities: 1, bonds: 0.25 },
      bonds: { equities: 0.25, bonds: 1 },
    })

    expect(assumptions.weightedGrossNominalReturnPercent).toBeCloseTo(6.4)
    expect(assumptions.weightedAnnualFeePercent).toBeCloseTo(0.16)
    expect(assumptions.netNominalReturnPercent).toBeCloseTo(6.24)
    expect(assumptions.weightedCashDistributionYieldPercent).toBeCloseTo(2.4)
    // Variance = .6²·10² + .4²·5² + 2·.6·.4·10·5·.25 = 46 (%²).
    expect(assumptions.volatilityPercent).toBeCloseTo(Math.sqrt(46))
  })
})
