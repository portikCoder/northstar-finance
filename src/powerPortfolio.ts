import type { AssetSleeve } from './portfolioSleeves'

export interface PowerPortfolioInput {
  currentEquityAllocationPercent: number
  equityAllocationPercent: number
  equityNominalReturnPercent: number
  equityVolatilityPercent: number
  equityAnnualFeePercent: number
  equityDistributionYieldPercent: number
  bondNominalReturnPercent: number
  bondVolatilityPercent: number
  bondAnnualFeePercent: number
  bondDistributionYieldPercent: number
  equityBondCorrelation: number
}

export interface PowerPortfolioSleeve extends AssetSleeve {
  currentWeightPercent: number
}

export interface PowerPortfolioConfiguration {
  sleeves: PowerPortfolioSleeve[]
  correlations: Record<string, Record<string, number>>
}

function boundedPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

/** Build the canonical equity/bond definitions shared by deterministic and Monte Carlo paths. */
export function buildPowerPortfolioConfiguration(
  input: PowerPortfolioInput,
): PowerPortfolioConfiguration {
  const currentEquityWeight = boundedPercent(input.currentEquityAllocationPercent)
  const targetEquityWeight = boundedPercent(input.equityAllocationPercent)
  const equityBondCorrelation = Math.max(-1, Math.min(1, input.equityBondCorrelation))

  return {
    sleeves: [
      {
        id: 'equities',
        currentWeightPercent: currentEquityWeight,
        targetWeightPercent: targetEquityWeight,
        nominalReturnPercent: input.equityNominalReturnPercent,
        volatilityPercent: input.equityVolatilityPercent,
        annualFeePercent: input.equityAnnualFeePercent,
        distributionYieldPercent: input.equityDistributionYieldPercent,
      },
      {
        id: 'bonds',
        currentWeightPercent: 100 - currentEquityWeight,
        targetWeightPercent: 100 - targetEquityWeight,
        nominalReturnPercent: input.bondNominalReturnPercent,
        volatilityPercent: input.bondVolatilityPercent,
        annualFeePercent: input.bondAnnualFeePercent,
        distributionYieldPercent: input.bondDistributionYieldPercent,
      },
    ],
    correlations: {
      equities: { equities: 1, bonds: equityBondCorrelation },
      bonds: { equities: equityBondCorrelation, bonds: 1 },
    },
  }
}
