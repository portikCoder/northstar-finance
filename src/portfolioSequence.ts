/** Net-of-fee nominal annual return and annual volatility for one asset sleeve. */
export interface ReturnSleeve {
  id: string
  nominalReturnPercent: number
  volatilityPercent: number
}

/** Correlations are indexed first by row sleeve id, then by column sleeve id. */
export type SleeveCorrelationMatrix = Record<string, Record<string, number>>

/** A single sleeve's simple return for one simulated month, expressed as a decimal. */
export interface SleeveMonthlyReturn {
  sleeveId: string
  return: number
}

/** Indexed as paths[run][month][sleeve]. */
export type PortfolioReturnPaths = SleeveMonthlyReturn[][][]

const CORRELATION_TOLERANCE = 1e-10

function validateCount(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`)
  }
}

function validateAndFactorCorrelationMatrix(
  sleeves: readonly ReturnSleeve[],
  matrix: SleeveCorrelationMatrix,
): number[][] {
  const ids = sleeves.map(({ id }) => id)
  const expectedIds = new Set(ids)
  const matrixIds = Object.keys(matrix)

  for (const id of ids) {
    if (!Object.hasOwn(matrix, id)) {
      throw new TypeError(`Correlation matrix is missing row for sleeve ${id}`)
    }
  }
  for (const id of matrixIds) {
    if (!expectedIds.has(id)) {
      throw new TypeError(`Correlation matrix contains unknown sleeve id: ${id}`)
    }
  }

  const values = ids.map((rowId, row) => {
    const rowValues = matrix[rowId]
    if (!rowValues || typeof rowValues !== 'object') {
      throw new TypeError(`Correlation matrix row for sleeve ${rowId} must be an object`)
    }

    for (const columnId of ids) {
      if (!Object.hasOwn(rowValues, columnId)) {
        throw new TypeError(`Correlation matrix is missing value for sleeves ${rowId} and ${columnId}`)
      }
    }
    for (const columnId of Object.keys(rowValues)) {
      if (!expectedIds.has(columnId)) {
        throw new TypeError(`Correlation matrix row for sleeve ${rowId} contains unknown sleeve id: ${columnId}`)
      }
    }

    return ids.map((columnId, column) => {
      const value = rowValues[columnId]
      if (!Number.isFinite(value)) {
        throw new RangeError(`Correlation for sleeves ${rowId} and ${columnId} must be finite`)
      }
      if (value < -1 - CORRELATION_TOLERANCE || value > 1 + CORRELATION_TOLERANCE) {
        throw new RangeError(`Correlation for sleeves ${rowId} and ${columnId} must be between -1 and 1`)
      }

      const bounded = Math.max(-1, Math.min(1, value))
      if (row === column && Math.abs(bounded - 1) > CORRELATION_TOLERANCE) {
        throw new RangeError(`Correlation matrix diagonal for sleeve ${rowId} must be 1`)
      }
      return bounded
    })
  })

  // Symmetrize only floating-point-sized input differences after checking them.
  for (let row = 0; row < ids.length; row += 1) {
    values[row][row] = 1
    for (let column = 0; column < row; column += 1) {
      const left = values[row][column]
      const right = values[column][row]
      if (Math.abs(left - right) > CORRELATION_TOLERANCE) {
        throw new RangeError(`Correlation matrix must be symmetric for sleeves ${ids[row]} and ${ids[column]}`)
      }
      values[row][column] = (left + right) / 2
      values[column][row] = values[row][column]
    }
  }

  // Lower-triangular Cholesky factorization; zero pivots allow PSD (singular) matrices.
  const factor = ids.map(() => ids.map(() => 0))
  for (let row = 0; row < ids.length; row += 1) {
    for (let column = 0; column <= row; column += 1) {
      let residual = values[row][column]
      for (let inner = 0; inner < column; inner += 1) {
        residual -= factor[row][inner] * factor[column][inner]
      }

      if (row === column) {
        if (residual < -CORRELATION_TOLERANCE) {
          throw new RangeError(`Correlation matrix is not positive semidefinite near sleeve ${ids[row]}`)
        }
        factor[row][column] = Math.sqrt(Math.max(0, residual))
      } else if (factor[column][column] > CORRELATION_TOLERANCE) {
        factor[row][column] = residual / factor[column][column]
      } else if (Math.abs(residual) > CORRELATION_TOLERANCE) {
        throw new RangeError(`Correlation matrix is not positive semidefinite near sleeves ${ids[row]} and ${ids[column]}`)
      }
    }
  }

  return factor
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return (state >>> 0) / 4_294_967_296
  }
}

function normalRandom(random: () => number): () => number {
  let spare: number | undefined
  return () => {
    if (spare !== undefined) {
      const result = spare
      spare = undefined
      return result
    }

    const first = Math.max(Number.EPSILON, random())
    const second = random()
    const radius = Math.sqrt(-2 * Math.log(first))
    const angle = 2 * Math.PI * second
    spare = radius * Math.sin(angle)
    return radius * Math.cos(angle)
  }
}

/**
 * Generate deterministic monthly simple-return paths with correlated normal
 * innovations and the planner's monthly lognormal return convention.
 *
 * The result is indexed as `paths[run][month]`; each month contains one
 * `{ sleeveId, return }` entry per sleeve in the supplied sleeve order.
 */
export function* iteratePortfolioSequenceRuns(
  sleeves: readonly ReturnSleeve[],
  correlationMatrix: SleeveCorrelationMatrix,
  months: number,
  runs: number,
  seed: number,
): Generator<SleeveMonthlyReturn[][], void, void> {
  validateCount(months, 'Months')
  validateCount(runs, 'Runs')
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError('Seed must be a safe integer')
  }

  const sleeveIds = new Set<string>()
  for (const sleeve of sleeves) {
    if (sleeve.id.length === 0) throw new TypeError('Sleeve ids must not be empty')
    if (sleeveIds.has(sleeve.id)) throw new TypeError(`Duplicate sleeve id: ${sleeve.id}`)
    sleeveIds.add(sleeve.id)
    if (!Number.isFinite(sleeve.nominalReturnPercent)) {
      throw new RangeError(`Nominal return for sleeve ${sleeve.id} must be finite`)
    }
    if (!Number.isFinite(sleeve.volatilityPercent) || sleeve.volatilityPercent < 0) {
      throw new RangeError(`Volatility for sleeve ${sleeve.id} must be finite and non-negative`)
    }
  }

  const cholesky = validateAndFactorCorrelationMatrix(sleeves, correlationMatrix)
  const random = seededRandom(seed)
  const normal = normalRandom(random)
  const monthlyMeans = sleeves.map(({ nominalReturnPercent, volatilityPercent }) => {
    const annualVolatility = volatilityPercent / 100
    return (Math.log(Math.max(0.001, 1 + nominalReturnPercent / 100))
      - annualVolatility * annualVolatility / 2) / 12
  })
  const monthlyDeviations = sleeves.map(({ volatilityPercent }) => volatilityPercent / 100 / Math.sqrt(12))

  for (let run = 0; run < runs; run += 1) {
    yield Array.from({ length: months }, () => {
      const independentNormals = sleeves.map(() => normal())
      const correlatedNormals = sleeves.map((_, row) => {
        let value = 0
        for (let column = 0; column <= row; column += 1) {
          value += cholesky[row][column] * independentNormals[column]
        }
        return value
      })

      return sleeves.map((sleeve, index): SleeveMonthlyReturn => ({
        sleeveId: sleeve.id,
        return: Math.exp(monthlyMeans[index] + monthlyDeviations[index] * correlatedNormals[index]) - 1,
      }))
    })
  }
}

/** Collect all paths when a caller explicitly needs them in memory. */
export function generatePortfolioSequence(
  sleeves: readonly ReturnSleeve[],
  correlationMatrix: SleeveCorrelationMatrix,
  months: number,
  runs: number,
  seed: number,
): PortfolioReturnPaths {
  return Array.from(iteratePortfolioSequenceRuns(sleeves, correlationMatrix, months, runs, seed))
}
