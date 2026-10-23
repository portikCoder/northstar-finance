/**
 * Planning assumptions for one asset sleeve. All rates and weights are in
 * percent units (for example, 7.5 means 7.5%).
 */
export interface AssetSleeve {
  id: string
  targetWeightPercent: number
  nominalReturnPercent: number
  volatilityPercent: number
  annualFeePercent: number
  distributionYieldPercent: number
}

/** Correlations indexed first by sleeve id, then by sleeve id. */
export type SleeveCorrelationMatrix = Readonly<
  Record<string, Readonly<Record<string, number>>>
>

export interface PortfolioSleeveAssumptions {
  weightedGrossNominalReturnPercent: number
  weightedAnnualFeePercent: number
  netNominalReturnPercent: number
  weightedCashDistributionYieldPercent: number
  volatilityPercent: number
}

const CORRELATION_TOLERANCE = 1e-12

function validateSleeves(sleeves: readonly AssetSleeve[]): void {
  const ids = new Set<string>()

  for (const sleeve of sleeves) {
    if (typeof sleeve.id !== 'string' || sleeve.id.length === 0) {
      throw new TypeError('Sleeve ids must be non-empty strings')
    }
    if (ids.has(sleeve.id)) {
      throw new TypeError(`Duplicate sleeve id: ${sleeve.id}`)
    }
    ids.add(sleeve.id)

    if (!Number.isFinite(sleeve.targetWeightPercent) || sleeve.targetWeightPercent < 0) {
      throw new RangeError(`Target weight for sleeve ${sleeve.id} must be finite and non-negative`)
    }
    if (!Number.isFinite(sleeve.nominalReturnPercent)) {
      throw new RangeError(`Nominal return for sleeve ${sleeve.id} must be finite`)
    }
    for (const [label, value] of [
      ['Volatility', sleeve.volatilityPercent],
      ['Annual fee', sleeve.annualFeePercent],
      ['Distribution yield', sleeve.distributionYieldPercent],
    ] as const) {
      if (!Number.isFinite(value) || value < 0) {
        throw new RangeError(`${label} for sleeve ${sleeve.id} must be finite and non-negative`)
      }
    }
  }
}

/** Normalize finite non-negative weights without overflowing their sum. */
function normalizedWeights(sleeves: readonly AssetSleeve[]): number[] {
  if (sleeves.length === 0) return []

  const maxWeight = sleeves.reduce(
    (max, sleeve) => Math.max(max, sleeve.targetWeightPercent),
    0,
  )
  if (maxWeight === 0) {
    throw new RangeError('Target weights must have a positive total')
  }

  const scaledWeights = sleeves.map((sleeve) => sleeve.targetWeightPercent / maxWeight)
  const scaledTotal = scaledWeights.reduce((sum, weight) => sum + weight, 0)
  return scaledWeights.map((weight) => weight / scaledTotal)
}

function getCorrelation(
  matrix: SleeveCorrelationMatrix,
  firstId: string,
  secondId: string,
): number {
  const row = matrix[firstId]
  if (row === undefined || !Object.hasOwn(row, secondId)) {
    throw new TypeError(`Missing correlation for sleeves ${firstId} and ${secondId}`)
  }

  const correlation = row[secondId]
  if (!Number.isFinite(correlation) || correlation < -1 || correlation > 1) {
    throw new RangeError(`Correlation for sleeves ${firstId} and ${secondId} must be in [-1, 1]`)
  }
  return correlation
}

function validateCorrelationMatrix(
  sleeves: readonly AssetSleeve[],
  matrix: SleeveCorrelationMatrix,
): void {
  for (const sleeve of sleeves) {
    const diagonal = getCorrelation(matrix, sleeve.id, sleeve.id)
    if (Math.abs(diagonal - 1) > CORRELATION_TOLERANCE) {
      throw new RangeError(`Correlation of sleeve ${sleeve.id} with itself must be 1`)
    }

    for (const other of sleeves) {
      const forward = getCorrelation(matrix, sleeve.id, other.id)
      const reverse = getCorrelation(matrix, other.id, sleeve.id)
      if (Math.abs(forward - reverse) > CORRELATION_TOLERANCE) {
        throw new RangeError(`Correlations for sleeves ${sleeve.id} and ${other.id} must be symmetric`)
      }
    }
  }
}

function weightedAverage(
  sleeves: readonly AssetSleeve[],
  weights: readonly number[],
  value: (sleeve: AssetSleeve) => number,
): number {
  return sleeves.reduce((sum, sleeve, index) => sum + weights[index] * value(sleeve), 0)
}

/**
 * Aggregate sleeve assumptions using normalized target weights. Gross return,
 * annual fee, and cash distribution yield are weighted arithmetic averages;
 * net nominal return is weighted gross nominal return minus weighted annual
 * fee. Portfolio volatility is the square root of the full
 * variance-covariance sum, using the supplied sleeve-id correlation matrix.
 *
 * All rates (including volatility) are expressed in percent units in and out.
 * An empty sleeve list returns zero assumptions; a non-empty list must have a
 * positive total target weight. This is a planning calculation, not security
 * or tax advice.
 */
export function calculatePortfolioSleeveAssumptions(
  sleeves: readonly AssetSleeve[],
  correlations: SleeveCorrelationMatrix,
): PortfolioSleeveAssumptions {
  validateSleeves(sleeves)
  if (sleeves.length === 0) {
    return {
      weightedGrossNominalReturnPercent: 0,
      weightedAnnualFeePercent: 0,
      netNominalReturnPercent: 0,
      weightedCashDistributionYieldPercent: 0,
      volatilityPercent: 0,
    }
  }

  validateCorrelationMatrix(sleeves, correlations)
  const weights = normalizedWeights(sleeves)
  const weightedGrossNominalReturnPercent = weightedAverage(
    sleeves,
    weights,
    (sleeve) => sleeve.nominalReturnPercent,
  )
  const weightedAnnualFeePercent = weightedAverage(
    sleeves,
    weights,
    (sleeve) => sleeve.annualFeePercent,
  )
  const netNominalReturnPercent = weightedGrossNominalReturnPercent - weightedAnnualFeePercent
  const weightedCashDistributionYieldPercent = weightedAverage(
    sleeves,
    weights,
    (sleeve) => sleeve.distributionYieldPercent,
  )

  let variance = 0
  let absoluteVarianceTerms = 0
  for (let row = 0; row < sleeves.length; row += 1) {
    for (let column = 0; column < sleeves.length; column += 1) {
      const term = weights[row]
        * weights[column]
        * sleeves[row].volatilityPercent
        * sleeves[column].volatilityPercent
        * getCorrelation(correlations, sleeves[row].id, sleeves[column].id)
      variance += term
      absoluteVarianceTerms += Math.abs(term)
    }
  }

  if (!Number.isFinite(variance) || !Number.isFinite(absoluteVarianceTerms)) {
    throw new RangeError('Portfolio variance must be finite')
  }
  const roundingTolerance = 16 * Number.EPSILON * Math.max(1, absoluteVarianceTerms)
  if (variance < -roundingTolerance) {
    throw new RangeError('Correlation matrix produces a negative portfolio variance')
  }
  if (variance < 0) variance = 0

  return {
    weightedGrossNominalReturnPercent,
    weightedAnnualFeePercent,
    netNominalReturnPercent,
    weightedCashDistributionYieldPercent,
    volatilityPercent: Math.sqrt(variance),
  }
}
