import { RETIREMENT_MODES, runMonteCarlo } from './model'
import type { MonteCarloSummary, PlanInputs, RetirementMode } from './model'

interface MonteCarloRequest {
  inputs: PlanInputs
  monthlySpend: number
}

type MonteCarloResponse = Partial<Record<RetirementMode, MonteCarloSummary>>

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<MonteCarloRequest>) => void) | null
  postMessage: (message: MonteCarloResponse) => void
}

workerScope.onmessage = ({ data }) => {
  const summaries: MonteCarloResponse = {}
  for (const mode of RETIREMENT_MODES) {
    summaries[mode] = runMonteCarlo(data.inputs, data.monthlySpend, mode)
  }
  workerScope.postMessage(summaries)
}
