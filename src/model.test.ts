import { describe, expect, it } from 'vitest'
import {
  annualInvestableProfit,
  calculateTravelAllowance,
  currentPortfolioEur,
  DEFAULT_INPUTS,
  dividendFireNumber,
  drawdownCapitalRequirement,
  fireTargetAtAge,
  nominalReturnForMode,
  portfolioAssumptions,
  projectRetirement,
  realMonthlyReturn,
  runMonteCarlo,
  swrFireNumber,
} from './model'

describe('FIRE model', () => {
  it('converts the generic starting holdings into the EUR model currency', () => {
    expect(currentPortfolioEur(DEFAULT_INPUTS)).toBeCloseTo(49_200, 2)
  })

  it('applies the business reserve before investing expected profit', () => {
    expect(annualInvestableProfit(DEFAULT_INPUTS)).toBeCloseTo(23_640, 2)
  })

  it('calculates targets for the withdrawal-rate and dividend-income approaches', () => {
    expect(swrFireNumber(18_000, 3.5)).toBeCloseTo(514_285.71, 2)
    expect(dividendFireNumber(18_000, 1.9)).toBeCloseTo(947_368.42, 2)
  })

  it('calculates the planned-drawdown target from the end age and terminal floor', () => {
    const withNoFloor = drawdownCapitalRequirement(DEFAULT_INPUTS, 1_500, 37)
    const withFloor = drawdownCapitalRequirement(
      { ...DEFAULT_INPUTS, minimumTerminalBalance: 50_000 },
      1_500,
      37,
    )
    expect(withFloor).toBeGreaterThan(withNoFloor)
    expect(fireTargetAtAge(DEFAULT_INPUTS, 1_500, 'drawdown', 37)).toBe(withNoFloor)
  })

  it('uses the shrinking drawdown target as each month of the horizon passes', () => {
    const input = {
      ...DEFAULT_INPUTS,
      currentAge: 30,
      endAge: 32,
      eurPortfolio: 0,
      usdPortfolio: 0,
      annualProfit: 12_000,
      businessReservePercent: 0,
      depositFrequency: 'monthly' as const,
      nominalReturnPercent: 0,
      inflationPercent: 0,
      annualFeePercent: 0,
    }
    const projection = projectRetirement(input, 1_000, 'drawdown')
    expect(projection.fireMonth).toBe(12)
    expect(projection.endBalance).toBeCloseTo(0, 2)
  })

  it('uses monthly, quarterly, and annual contribution timing', () => {
    for (const depositFrequency of ['monthly', 'quarterly', 'yearly'] as const) {
      const input = {
        ...DEFAULT_INPUTS,
        eurPortfolio: 0,
        usdPortfolio: 0,
        annualProfit: 12_000,
        businessReservePercent: 0,
        depositFrequency,
        nominalReturnPercent: 0,
        inflationPercent: 0,
        annualFeePercent: 0,
      }
      const projection = projectRetirement(input, 1_500, 'swr')
      expect(projection.balances.find((point) => point.month === 12)?.balance).toBeCloseTo(12_000, 2)
    }
  })

  it('uses the entered quarterly amounts for an irregular schedule', () => {
    const input = {
      ...DEFAULT_INPUTS,
      eurPortfolio: 0,
      usdPortfolio: 0,
      depositFrequency: 'irregular' as const,
      irregularQuarterlyGross: [0, 0, 20_000, 0] as [number, number, number, number],
      businessReservePercent: 1.5,
      nominalReturnPercent: 0,
      inflationPercent: 0,
      annualFeePercent: 0,
    }
    const projection = projectRetirement(input, 1_500, 'swr')
    expect(projection.balances.find((point) => point.month === 12)?.balance).toBeCloseTo(19_700, 2)
  })

  it('stops contributions at FIRE and separates the spend-adjusted and no-withdrawal paths', () => {
    const input = {
      ...DEFAULT_INPUTS,
      eurPortfolio: 100_000,
      usdPortfolio: 0,
      annualProfit: 12_000,
      businessReservePercent: 0,
      nominalReturnPercent: 0,
      inflationPercent: 0,
      annualFeePercent: 0,
      withdrawalRatePercent: 12,
      currentAge: 30,
      idealFireAge: 31,
      endAge: 32,
    }
    const projection = projectRetirement(input, 1_000, 'swr')
    const firePoint = projection.balances.find((point) => point.month === projection.fireMonth)
    const endPoint = projection.balances.at(-1)!

    expect(projection.fireMonth).toBe(0)
    expect(firePoint?.balance).toBe(firePoint?.noWithdrawalBalance)
    expect(endPoint.noWithdrawalBalance).toBeGreaterThan(endPoint.balance)
    expect(endPoint.balance).toBeCloseTo(76_000, 2)
  })

  it('can retain exact monthly balances for interactive chart inspection', () => {
    const input = {
      ...DEFAULT_INPUTS,
      eurPortfolio: 100_000,
      usdPortfolio: 0,
      annualProfit: 0,
      nominalReturnPercent: 0,
      inflationPercent: 0,
      annualFeePercent: 0,
      withdrawalRatePercent: 100,
      currentAge: 30,
      endAge: 31,
    }
    const projection = projectRetirement(input, 1_000, 'swr', 0, true)

    expect(projection.balances).toHaveLength(13)
    expect(projection.balances.map(({ month }) => month)).toEqual(Array.from({ length: 13 }, (_, month) => month))
  })

  it('reports dividend-only shortfalls without silently drawing principal', () => {
    const input = {
      ...DEFAULT_INPUTS,
      eurPortfolio: 1_800_000,
      usdPortfolio: 0,
      annualProfit: 0,
      nominalReturnPercent: 0,
      inflationPercent: 0,
      annualFeePercent: 0,
      dividendYieldPercent: 1,
      currentAge: 30,
      endAge: 31,
    }
    const projection = projectRetirement(input, 1_500, 'dividends')
    expect(projection.fireMonth).toBe(0)
    expect(projection.firstIncomeShortfallMonth).not.toBeNull()
    expect(projection.incomeShortfallTotal).toBeGreaterThan(0)
    expect(projection.endBalance).toBeLessThan(1_800_000)
    expect(projection.noWithdrawalEndBalance).toBeGreaterThan(projection.endBalance)
  })

  it('finds a travel budget within the six-month delay limit', () => {
    const allowance = calculateTravelAllowance(DEFAULT_INPUTS, 1_500, 'swr', 6)
    expect(allowance.annualBudget).not.toBeNull()

    const baseline = projectRetirement(DEFAULT_INPUTS, 1_500, 'swr').fireMonth!
    const withAllowance = projectRetirement(
      DEFAULT_INPUTS,
      1_500,
      'swr',
      allowance.annualBudget!,
    ).fireMonth!
    expect(withAllowance - baseline).toBeLessThanOrEqual(6)
  })

  it('uses the conservative dividend-yield default and reaches the ideal-age balance', () => {
    expect(DEFAULT_INPUTS.dividendYieldPercent).toBe(1.9)
    const projection = projectRetirement(DEFAULT_INPUTS, 1_500, 'swr')
    expect(projection.fireMonth).not.toBeNull()
    expect(projection.balanceAtIdealAge).toBeGreaterThan(currentPortfolioEur(DEFAULT_INPUTS))
    expect(realMonthlyReturn(DEFAULT_INPUTS)).toBeGreaterThan(0)
  })

  it('applies the effective dividend tax to spendable yield and reports net income', () => {
    const input = {
      ...DEFAULT_INPUTS,
      eurPortfolio: 3_200_000,
      usdPortfolio: 0,
      annualProfit: 0,
      dividendTaxPercent: 25,
      dividendYieldPercent: 0.5,
      nominalReturnPercent: 0,
      inflationPercent: 0,
      annualFeePercent: 0,
      currentAge: 30,
      endAge: 31,
    }
    const projection = projectRetirement(input, 1_000, 'dividends')
    expect(projection.fireMonth).toBe(0)
    expect(fireTargetAtAge(input, 1_000, 'dividends', 30)).toBeCloseTo(3_200_000, 2)
    expect(projection.annualGrossDividendIncomeAtFire).toBeCloseTo(16_000, 2)
    expect(projection.annualDividendIncomeAtFire).toBeCloseTo(12_000, 2)
    expect(projection.firstIncomeShortfallMonth).not.toBeNull()
  })

  it('uses optional income streams and net property rent to reduce portfolio needs', () => {
    const input = {
      ...DEFAULT_INPUTS,
      eurPortfolio: 100_000,
      usdPortfolio: 0,
      annualProfit: 0,
      nominalReturnPercent: 0,
      inflationPercent: 0,
      annualFeePercent: 0,
      withdrawalRatePercent: 10,
      propertyGrossRentMonthly: 1_000,
      propertyExpensesMonthly: 100,
      propertyMortgagePaymentMonthly: 400,
      incomeStreams: [{ id: 'pension', name: 'Pension', monthlyAmount: 300, startAge: 31, endAge: null }],
      currentAge: 30,
      endAge: 32,
    }
    const projection = projectRetirement(input, 1_000, 'swr')
    expect(projection.fireMonth).toBe(0)
    expect(projection.endBalance).toBeCloseTo(91_900, 2)
  })

  it('includes separate post-FIRE travel spending in the target and retirement path', () => {
    const input = {
      ...DEFAULT_INPUTS,
      eurPortfolio: 100_000,
      usdPortfolio: 0,
      annualProfit: 0,
      nominalReturnPercent: 0,
      inflationPercent: 0,
      annualFeePercent: 0,
      withdrawalRatePercent: 100,
      currentAge: 30,
      endAge: 31,
    }
    const base = projectRetirement(input, 1_000, 'swr')
    const withTravel = projectRetirement({ ...input, postFireTravelAnnual: 12_000 }, 1_000, 'swr')
    expect(fireTargetAtAge({ ...input, postFireTravelAnnual: 12_000 }, 1_000, 'swr', 30)).toBe(24_000)
    expect(withTravel.fireMonth).toBe(0)
    expect(withTravel.endBalance).toBeCloseTo(base.endBalance - 12_000, 2)
  })

  it('uses a per-approach return override without changing the shared return', () => {
    const input = {
      ...DEFAULT_INPUTS,
      eurPortfolio: 100_000,
      usdPortfolio: 0,
      annualProfit: 0,
      returnOverrides: { ...DEFAULT_INPUTS.returnOverrides, swr: 0 },
      inflationPercent: 0,
      annualFeePercent: 0,
      currentAge: 30,
      endAge: 31,
      withdrawalRatePercent: 100,
    }
    const projection = projectRetirement(input, 1_000, 'swr')
    expect(projection.endBalance).toBeCloseTo(88_000, 2)
    expect(realMonthlyReturn(input, 'drawdown')).toBeGreaterThan(0)
  })

  it('derives weighted return and volatility from power-user portfolio assumptions', () => {
    const input = {
      ...DEFAULT_INPUTS,
      portfolioSetupMode: 'power' as const,
      equityAllocationPercent: 80,
      equityNominalReturnPercent: 7,
      equityVolatilityPercent: 15,
      bondNominalReturnPercent: 3,
      bondVolatilityPercent: 3,
      equityBondCorrelation: 0,
    }
    const assumptions = portfolioAssumptions(input)

    expect(assumptions.nominalReturnPercent).toBeCloseTo(6.2, 8)
    expect(assumptions.volatilityPercent).toBeCloseTo(Math.sqrt(0.8 ** 2 * 15 ** 2 + 0.2 ** 2 * 3 ** 2), 8)
    expect(nominalReturnForMode(input, 'swr')).toBeCloseTo(6.2, 8)
    expect(realMonthlyReturn(input)).toBeCloseTo(
      Math.pow((1 + (6.2 - assumptions.annualFeePercent) / 100) / (1 + input.inflationPercent / 100), 1 / 12) - 1,
      10,
    )
    expect(nominalReturnForMode({ ...input, returnOverrides: { ...input.returnOverrides, swr: 5 } }, 'swr')).toBe(5)
  })

  it('keeps the default simple setup on the existing shared assumptions', () => {
    const assumptions = portfolioAssumptions(DEFAULT_INPUTS)
    expect(assumptions).toEqual({
      nominalReturnPercent: DEFAULT_INPUTS.nominalReturnPercent,
      annualFeePercent: DEFAULT_INPUTS.annualFeePercent,
      netNominalReturnPercent: DEFAULT_INPUTS.nominalReturnPercent - DEFAULT_INPUTS.annualFeePercent,
      distributionYieldPercent: DEFAULT_INPUTS.dividendYieldPercent,
      volatilityPercent: DEFAULT_INPUTS.returnVolatilityPercent,
    })
  })

  it('uses separate current and target weights with the selected rebalance schedule', () => {
    const input = {
      ...DEFAULT_INPUTS,
      portfolioSetupMode: 'power' as const,
      eurPortfolio: 100_000,
      usdPortfolio: 0,
      annualProfit: 0,
      currentAge: 30,
      endAge: 31,
      withdrawalRatePercent: 0,
      inflationPercent: 0,
      equityAllocationPercent: 0,
      currentEquityAllocationPercent: 100,
      equityNominalReturnPercent: 12,
      equityVolatilityPercent: 0,
      equityAnnualFeePercent: 0,
      bondNominalReturnPercent: 0,
      bondVolatilityPercent: 0,
      bondAnnualFeePercent: 0,
      rebalanceSchedule: 'never' as const,
    }
    const holdCurrentMix = projectRetirement(input, 1_000, 'swr')
    const rebalanceMonthly = projectRetirement({ ...input, rebalanceSchedule: 'monthly' }, 1_000, 'swr')

    expect(holdCurrentMix.endBalance).toBeCloseTo(112_000, 2)
    expect(rebalanceMonthly.endBalance).toBeLessThan(holdCurrentMix.endBalance)
  })

  it('uses target-weighted sleeve income yield in the power-user dividend target', () => {
    const input = {
      ...DEFAULT_INPUTS,
      portfolioSetupMode: 'power' as const,
      equityAllocationPercent: 50,
      equityDistributionYieldPercent: 1,
      bondDistributionYieldPercent: 3,
      equityAnnualFeePercent: 0,
      bondAnnualFeePercent: 0,
      dividendTaxPercent: 0,
    }
    expect(portfolioAssumptions(input).distributionYieldPercent).toBeCloseTo(2)
    expect(fireTargetAtAge(input, 1_000, 'dividends', 30)).toBeCloseTo(600_000)
  })

  it('produces reproducible Monte Carlo outcomes and matches the deterministic path at zero volatility', () => {
    const input = {
      ...DEFAULT_INPUTS,
      eurPortfolio: 100_000,
      usdPortfolio: 0,
      annualProfit: 0,
      returnVolatilityPercent: 0,
      monteCarloRuns: 100,
      withdrawalRatePercent: 100,
      endAge: 31,
    }
    const summary = runMonteCarlo(input, 1_000, 'swr')
    const repeated = runMonteCarlo(input, 1_000, 'swr')
    const deterministic = projectRetirement(input, 1_000, 'swr')
    expect(summary).toEqual(repeated)
    expect(summary.endBalanceMedian).toBeCloseTo(deterministic.endBalance, 2)
  })

  it('uses correlated sleeve paths in the power-user Monte Carlo simulation', () => {
    const input = {
      ...DEFAULT_INPUTS,
      portfolioSetupMode: 'power' as const,
      currentAge: 30,
      endAge: 31,
      eurPortfolio: 100_000,
      usdPortfolio: 0,
      annualProfit: 0,
      equityAllocationPercent: 60,
      currentEquityAllocationPercent: 100,
      equityVolatilityPercent: 0,
      bondVolatilityPercent: 0,
      returnVolatilityPercent: 0,
      monteCarloRuns: 100,
      withdrawalRatePercent: 100,
      rebalanceSchedule: 'monthly' as const,
    }
    const summary = runMonteCarlo(input, 1_000, 'swr')
    const repeated = runMonteCarlo(input, 1_000, 'swr')
    const deterministic = projectRetirement(input, 1_000, 'swr')

    expect(summary).toEqual(repeated)
    expect(summary.endBalanceMedian).toBeCloseTo(deterministic.endBalance, 2)
  })
})
