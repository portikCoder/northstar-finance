/** A portfolio sleeve with independent current and desired allocation weights. */
export interface PortfolioSleeve {
  id: string
  currentWeightPercent: number
  targetWeightPercent: number
}

/** Monetary balances keyed by sleeve id. */
export type SleeveBalances = Record<string, number>

/** Decimal returns keyed by sleeve id (for example, 0.05 means a 5% return). */
export type SleeveReturns = Record<string, number>

export type RebalanceSchedule = 'never' | 'monthly' | 'annually'

type WeightKey = 'currentWeightPercent' | 'targetWeightPercent'

function validateSleeves(sleeves: readonly PortfolioSleeve[]): void {
  const ids = new Set<string>()

  for (const sleeve of sleeves) {
    if (sleeve.id.length === 0) {
      throw new TypeError('Sleeve ids must not be empty')
    }
    if (ids.has(sleeve.id)) {
      throw new TypeError(`Duplicate sleeve id: ${sleeve.id}`)
    }
    ids.add(sleeve.id)

    for (const key of ['currentWeightPercent', 'targetWeightPercent'] as const) {
      const weight = sleeve[key]
      if (!Number.isFinite(weight) || weight < 0) {
        throw new RangeError(`${key} for sleeve ${sleeve.id} must be finite and non-negative`)
      }
    }
  }
}

function validateNonNegativeAmount(amount: number, name: string): void {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`${name} must be finite and non-negative`)
  }
}

function validateBalances(balances: SleeveBalances): void {
  for (const [id, balance] of Object.entries(balances)) {
    if (!Number.isFinite(balance) || balance < 0) {
      throw new RangeError(`Balance for sleeve ${id} must be finite and non-negative`)
    }
  }
}

/**
 * Normalize the selected weights to shares. If every selected weight is zero,
 * use equal shares in sleeve order so allocations remain deterministic.
 */
function normalizedWeights(
  sleeves: readonly PortfolioSleeve[],
  key: WeightKey,
): number[] {
  if (sleeves.length === 0) return []

  const weights = sleeves.map((sleeve) => sleeve[key])
  const maxWeight = weights.reduce((max, weight) => Math.max(max, weight), 0)
  if (maxWeight === 0) return weights.map(() => 1 / sleeves.length)

  const scaledWeights = weights.map((weight) => weight / maxWeight)
  const scaledTotal = scaledWeights.reduce((sum, weight) => sum + weight, 0)
  return scaledWeights.map((weight) => weight / scaledTotal)
}

/**
 * Split an amount using weights, assigning floating-point remainder to the
 * last positive-weight sleeve so the returned amounts sum to the input.
 */
function allocateByWeight(
  amount: number,
  sleeves: readonly PortfolioSleeve[],
  key: WeightKey,
): SleeveBalances {
  validateNonNegativeAmount(amount, 'Amount')
  validateSleeves(sleeves)

  const shares = normalizedWeights(sleeves, key)
  let allocated = 0
  let lastPositiveIndex = -1
  for (let index = 0; index < shares.length; index += 1) {
    if (shares[index] > 0) lastPositiveIndex = index
  }

  const entries = sleeves.map((sleeve, index): [string, number] => {
    const value = index === lastPositiveIndex
      ? amount - allocated
      : amount * shares[index]
    allocated += value
    return [sleeve.id, value]
  })

  return Object.fromEntries(entries)
}

/** Allocate an existing starting balance according to sleeves' current weights. */
export function allocateStartingBalance(
  startingBalance: number,
  sleeves: readonly PortfolioSleeve[],
): SleeveBalances {
  return allocateByWeight(startingBalance, sleeves, 'currentWeightPercent')
}

/** Allocate a new contribution according to sleeves' target weights. */
export function allocateContribution(
  contribution: number,
  sleeves: readonly PortfolioSleeve[],
): SleeveBalances {
  return allocateByWeight(contribution, sleeves, 'targetWeightPercent')
}

/**
 * Apply a signed cash flow: contributions follow target weights; withdrawals
 * reduce existing sleeve balances pro rata and cannot take the portfolio below zero.
 */
export function applyPortfolioCashflow(
  balances: SleeveBalances,
  cashflow: number,
  sleeves: readonly PortfolioSleeve[],
): SleeveBalances {
  validateBalances(balances)
  if (!Number.isFinite(cashflow)) throw new RangeError('Cash flow must be finite')
  if (cashflow >= 0) {
    const contributions = allocateContribution(cashflow, sleeves)
    return Object.fromEntries(sleeves.map(({ id }) => [id, (balances[id] ?? 0) + (contributions[id] ?? 0)]))
  }

  const totalBalance = Object.values(balances).reduce((sum, balance) => sum + balance, 0)
  if (totalBalance === 0) return { ...balances }
  const withdrawal = Math.min(-cashflow, totalBalance)
  const remainingFraction = Math.max(0, 1 - withdrawal / totalBalance)
  return Object.fromEntries(Object.entries(balances).map(([id, balance]) => [
    id,
    Math.max(0, balance * remainingFraction),
  ]))
}

/** Apply each sleeve's decimal return, treating an omitted return as zero. */
export function applySleeveReturns(
  balances: SleeveBalances,
  returns: SleeveReturns,
): SleeveBalances {
  validateBalances(balances)

  return Object.fromEntries(Object.entries(balances).map(([id, balance]) => {
    const rate = returns[id] ?? 0
    if (!Number.isFinite(rate) || rate < -1) {
      throw new RangeError(`Return for sleeve ${id} must be finite and at least -1`)
    }
    return [id, balance * (1 + rate)]
  }))
}

/**
 * Return whether a rebalance is due. Projection months are one-based; annual
 * rebalancing occurs at months 12, 24, and so on.
 */
function isRebalanceDue(schedule: RebalanceSchedule, monthIndex: number): boolean {
  if (!Number.isInteger(monthIndex) || monthIndex < 1) {
    throw new RangeError('Month index must be a positive integer (month 1 is the first projection month)')
  }

  switch (schedule) {
    case 'never':
      return false
    case 'monthly':
      return true
    case 'annually':
      return monthIndex % 12 === 0
    default:
      throw new TypeError('Unsupported rebalance schedule')
  }
}

/**
 * Rebalance all supplied balances to target weights when the schedule is due.
 * The total balance is conserved; if target weights are all zero, equal shares
 * are used. A non-due rebalance returns an unchanged copy of the balances.
 */
export function rebalanceToTargetWeights(
  balances: SleeveBalances,
  sleeves: readonly PortfolioSleeve[],
  schedule: RebalanceSchedule,
  monthIndex: number,
): SleeveBalances {
  validateBalances(balances)
  validateSleeves(sleeves)
  if (!isRebalanceDue(schedule, monthIndex)) return { ...balances }
  if (sleeves.length === 0) return { ...balances }

  const totalBalance = Object.values(balances).reduce((sum, balance) => sum + balance, 0)
  return allocateByWeight(totalBalance, sleeves, 'targetWeightPercent')
}
