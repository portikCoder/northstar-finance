/** Summary outcome for one portfolio projection scenario. */
export interface PortfolioScenarioOutcome {
  scenarioId: string
  scenarioLabel: string
  fireMonth: number | null
  endBalance: number
  fundedThroughHorizonPercent: number
}

/** A scenario outcome with its differences from the selected baseline. */
export interface PortfolioComparisonRow extends PortfolioScenarioOutcome {
  fireMonthDelta: number | null
  endBalanceDelta: number
  fundedThroughHorizonDeltaPercentagePoints: number
}

/**
 * Compare projection outcomes against a baseline while preserving scenario order.
 * Positive deltas mean a later FIRE month, a higher ending balance, or a higher
 * funded-through-horizon percentage, respectively.
 */
export function comparePortfolioOutcomes(
  outcomes: readonly PortfolioScenarioOutcome[],
  baselineScenarioId: string,
): PortfolioComparisonRow[] {
  const scenariosById = new Map<string, PortfolioScenarioOutcome>()

  for (const outcome of outcomes) {
    if (scenariosById.has(outcome.scenarioId)) {
      throw new TypeError(`Duplicate portfolio scenario id: ${outcome.scenarioId}`)
    }
    scenariosById.set(outcome.scenarioId, outcome)
  }

  const baseline = scenariosById.get(baselineScenarioId)
  if (baseline === undefined) {
    throw new RangeError(`Baseline portfolio scenario id not found: ${baselineScenarioId}`)
  }

  return outcomes.map((outcome) => ({
    ...outcome,
    fireMonthDelta: outcome.fireMonth === null || baseline.fireMonth === null
      ? null
      : outcome.fireMonth - baseline.fireMonth,
    endBalanceDelta: outcome.endBalance - baseline.endBalance,
    fundedThroughHorizonDeltaPercentagePoints:
      outcome.fundedThroughHorizonPercent - baseline.fundedThroughHorizonPercent,
  }))
}
