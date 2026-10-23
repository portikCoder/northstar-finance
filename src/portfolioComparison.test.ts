import { describe, expect, it } from 'vitest'
import {
  comparePortfolioOutcomes,
  type PortfolioScenarioOutcome,
} from './portfolioComparison'

const baseline: PortfolioScenarioOutcome = {
  scenarioId: 'baseline',
  scenarioLabel: 'Baseline',
  fireMonth: 120,
  endBalance: 250_000,
  fundedThroughHorizonPercent: 82,
}

describe('portfolio comparison', () => {
  it('returns outcome rows in input order with deltas from the baseline', () => {
    const fasterScenario: PortfolioScenarioOutcome = {
      scenarioId: 'faster',
      scenarioLabel: 'Higher returns',
      fireMonth: 108,
      endBalance: 300_000,
      fundedThroughHorizonPercent: 91.5,
    }

    expect(comparePortfolioOutcomes([fasterScenario, baseline], 'baseline')).toEqual([
      {
        ...fasterScenario,
        fireMonthDelta: -12,
        endBalanceDelta: 50_000,
        fundedThroughHorizonDeltaPercentagePoints: 9.5,
      },
      {
        ...baseline,
        fireMonthDelta: 0,
        endBalanceDelta: 0,
        fundedThroughHorizonDeltaPercentagePoints: 0,
      },
    ])
  })

  it('uses null FIRE-month delta when either scenario does not reach FIRE', () => {
    const unreachableScenario: PortfolioScenarioOutcome = {
      scenarioId: 'unreachable',
      scenarioLabel: 'Unreachable',
      fireMonth: null,
      endBalance: 100_000,
      fundedThroughHorizonPercent: 20,
    }
    const unreachableBaseline = { ...baseline, fireMonth: null }

    expect(comparePortfolioOutcomes([unreachableScenario, baseline], 'baseline')).toEqual([
      {
        ...unreachableScenario,
        fireMonthDelta: null,
        endBalanceDelta: -150_000,
        fundedThroughHorizonDeltaPercentagePoints: -62,
      },
      {
        ...baseline,
        fireMonthDelta: 0,
        endBalanceDelta: 0,
        fundedThroughHorizonDeltaPercentagePoints: 0,
      },
    ])
    expect(comparePortfolioOutcomes([baseline], 'baseline')[0].fireMonthDelta).toBe(0)
    expect(comparePortfolioOutcomes([unreachableBaseline], 'baseline')[0].fireMonthDelta).toBeNull()
  })

  it('throws useful errors for a missing baseline or duplicate scenario ids', () => {
    expect(() => comparePortfolioOutcomes([baseline], 'missing'))
      .toThrow('Baseline portfolio scenario id not found: missing')
    expect(() => comparePortfolioOutcomes([baseline, { ...baseline }], 'baseline'))
      .toThrow('Duplicate portfolio scenario id: baseline')
  })
})
