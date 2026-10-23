import { describe, expect, it } from 'vitest'
import { generatePortfolioSequence, type ReturnSleeve, type SleeveCorrelationMatrix } from './portfolioSequence'

const sleeves: ReturnSleeve[] = [
  { id: 'equities', nominalReturnPercent: 7, volatilityPercent: 15 },
  { id: 'bonds', nominalReturnPercent: 3, volatilityPercent: 4 },
]

const correlations: SleeveCorrelationMatrix = {
  equities: { equities: 1, bonds: -0.25 },
  bonds: { equities: -0.25, bonds: 1 },
}

describe('portfolio return sequence', () => {
  it('produces repeatable paths for the same inputs and seed', () => {
    const first = generatePortfolioSequence(sleeves, correlations, 18, 12, 42)
    const second = generatePortfolioSequence(sleeves, correlations, 18, 12, 42)

    expect(second).toEqual(first)
    expect(generatePortfolioSequence(sleeves, correlations, 18, 12, 43)).not.toEqual(first)
  })

  it('returns the requested run, month, and sleeve dimensions in sleeve order', () => {
    const paths = generatePortfolioSequence(sleeves, correlations, 3, 2, 7)

    expect(paths).toHaveLength(2)
    expect(paths[0]).toHaveLength(3)
    expect(paths[0][0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ sleeveId: 'equities' }),
      expect.objectContaining({ sleeveId: 'bonds' }),
    ]))
    expect(paths[0][0].map(({ sleeveId }) => sleeveId)).toEqual(['equities', 'bonds'])
    expect(generatePortfolioSequence(sleeves, correlations, 0, 3, 7)).toEqual([[], [], []])
    expect(generatePortfolioSequence(sleeves, correlations, 3, 0, 7)).toEqual([])
  })

  it('uses the annual nominal return convention for zero-volatility sleeves', () => {
    const zeroVolSleeves = [
      { id: 'growth', nominalReturnPercent: 7, volatilityPercent: 0 },
      { id: 'loss', nominalReturnPercent: -150, volatilityPercent: 0 },
    ]
    const zeroVolCorrelations = {
      growth: { growth: 1, loss: 0 },
      loss: { growth: 0, loss: 1 },
    }
    const paths = generatePortfolioSequence(zeroVolSleeves, zeroVolCorrelations, 2, 1, 3)

    expect(paths[0][0][0].return).toBeCloseTo(1.07 ** (1 / 12) - 1, 14)
    expect(paths[0][1][0].return).toBeCloseTo(1.07 ** (1 / 12) - 1, 14)
    expect(paths[0][0][1].return).toBeCloseTo(0.001 ** (1 / 12) - 1, 14)
  })

  it('accepts positive-semidefinite singular correlation matrices', () => {
    const perfectlyCorrelated = {
      equities: { equities: 1, bonds: 1 },
      bonds: { equities: 1, bonds: 1 },
    }

    expect(() => generatePortfolioSequence(sleeves, perfectlyCorrelated, 2, 2, 1)).not.toThrow()
  })

  it('rejects incomplete, asymmetric, out-of-range, and non-PSD correlation matrices descriptively', () => {
    expect(() => generatePortfolioSequence(sleeves, {
      equities: { equities: 1 },
      bonds: { equities: 0, bonds: 1 },
    }, 1, 1, 1)).toThrow(/missing value/)

    expect(() => generatePortfolioSequence(sleeves, {
      equities: { equities: 1, bonds: 0.2 },
      bonds: { equities: 0.3, bonds: 1 },
    }, 1, 1, 1)).toThrow(/symmetric/)

    expect(() => generatePortfolioSequence(sleeves, {
      equities: { equities: 1, bonds: 1.2 },
      bonds: { equities: 1.2, bonds: 1 },
    }, 1, 1, 1)).toThrow(/between -1 and 1/)

    const threeSleeves = [...sleeves, { id: 'cash', nominalReturnPercent: 1, volatilityPercent: 1 }]
    const nonPsd = {
      equities: { equities: 1, bonds: 0.9, cash: -0.9 },
      bonds: { equities: 0.9, bonds: 1, cash: 0.9 },
      cash: { equities: -0.9, bonds: 0.9, cash: 1 },
    }
    expect(() => generatePortfolioSequence(threeSleeves, nonPsd, 1, 1, 1)).toThrow(/positive semidefinite/)
  })
})
