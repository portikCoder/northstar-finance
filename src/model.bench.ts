import { bench } from 'vitest'
import {
  calculateTravelAllowance,
  DEFAULT_INPUTS,
  projectRetirement,
  RETIREMENT_MODES,
  runMonteCarlo,
} from './model'

const powerInputs = {
  ...DEFAULT_INPUTS,
  portfolioSetupMode: 'power' as const,
  currentEquityAllocationPercent: 100,
  equityAllocationPercent: 50,
  monteCarloRuns: 1_000,
}
const singleSample = { iterations: 1, warmupIterations: 0, warmupTime: 0 }

bench('dashboard deterministic recalculation: three approaches', () => {
  for (const mode of RETIREMENT_MODES) {
    projectRetirement(DEFAULT_INPUTS, 1_500, mode, 0, true)
  }
}, singleSample)

bench('travel allowance search: three approaches', () => {
  for (const mode of RETIREMENT_MODES) {
    calculateTravelAllowance(DEFAULT_INPUTS, 1_500, mode, DEFAULT_INPUTS.travelDelayLimitMonths)
  }
}, singleSample)

bench('Power user Monte Carlo: 1,000 runs, three approaches', () => {
  for (const mode of RETIREMENT_MODES) {
    runMonteCarlo(powerInputs, 1_500, mode)
  }
}, singleSample)
