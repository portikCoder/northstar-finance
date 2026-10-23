import {
  allocateStartingBalance,
  applyPortfolioCashflow,
  applySleeveReturns,
  rebalanceToTargetWeights,
} from './portfolioAllocation'
import { calculatePortfolioSleeveAssumptions } from './portfolioSleeves'
import { iteratePortfolioSequenceRuns } from './portfolioSequence'

export type DepositFrequency = 'monthly' | 'quarterly' | 'yearly' | 'irregular'
export type DisplayCurrency = 'EUR' | 'RON'
export type RetirementMode = 'swr' | 'dividends' | 'drawdown'
export type PortfolioSetupMode = 'simple' | 'power'
export type RebalanceSchedule = 'never' | 'monthly' | 'annually'

export const RETIREMENT_MODES: RetirementMode[] = ['swr', 'dividends', 'drawdown']

function boundedPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function allocationSleeves(input: PlanInputs) {
  const currentEquityWeight = boundedPercent(input.currentEquityAllocationPercent)
  const targetEquityWeight = boundedPercent(input.equityAllocationPercent)
  return [
    {
      id: 'equities',
      currentWeightPercent: currentEquityWeight,
      targetWeightPercent: targetEquityWeight,
    },
    {
      id: 'bonds',
      currentWeightPercent: 100 - currentEquityWeight,
      targetWeightPercent: 100 - targetEquityWeight,
    },
  ]
}

function totalSleeveBalance(balances: Record<string, number>): number {
  return Object.values(balances).reduce((total, amount) => total + amount, 0)
}

function powerSleeveReturns(input: PlanInputs, mode: RetirementMode): Record<string, number> {
  const shared = portfolioAssumptions(input)
  const modeReturnAdjustment = nominalReturnForMode(input, mode) - shared.nominalReturnPercent
  const inflation = 1 + input.inflationPercent / 100
  const monthlyRate = (nominalReturnPercent: number, annualFeePercent: number) => {
    const realAnnual = (1 + (nominalReturnPercent + modeReturnAdjustment - annualFeePercent) / 100) / inflation - 1
    return Math.pow(1 + realAnnual, 1 / 12) - 1
  }
  return {
    equities: monthlyRate(input.equityNominalReturnPercent, input.equityAnnualFeePercent),
    bonds: monthlyRate(input.bondNominalReturnPercent, input.bondAnnualFeePercent),
  }
}

export interface IncomeStream {
  id: string
  name: string
  monthlyAmount: number
  startAge: number
  endAge: number | null
}

export type ReturnOverrides = Record<RetirementMode, number | null>

export interface PlanInputs {
  portfolioSetupMode: PortfolioSetupMode
  equityAllocationPercent: number
  currentEquityAllocationPercent: number
  equityNominalReturnPercent: number
  equityVolatilityPercent: number
  equityAnnualFeePercent: number
  equityDistributionYieldPercent: number
  bondNominalReturnPercent: number
  bondVolatilityPercent: number
  bondAnnualFeePercent: number
  bondDistributionYieldPercent: number
  equityBondCorrelation: number
  rebalanceSchedule: RebalanceSchedule
  currentAge: number
  idealFireAge: number
  endAge: number
  minimumTerminalBalance: number
  eurPortfolio: number
  eurUnrealizedGain: number
  usdPortfolio: number
  usdUnrealizedGain: number
  usdToEur: number
  eurToRon: number
  annualProfit: number
  businessReservePercent: number
  depositFrequency: DepositFrequency
  irregularQuarterlyGross: [number, number, number, number]
  nominalReturnPercent: number
  inflationPercent: number
  annualFeePercent: number
  withdrawalRatePercent: number
  dividendYieldPercent: number
  dividendTaxPercent: number
  returnOverrides: ReturnOverrides
  returnVolatilityPercent: number
  monteCarloRuns: number
  propertyValue: number
  propertyMortgageBalance: number
  propertyGrossRentMonthly: number
  propertyExpensesMonthly: number
  propertyMortgagePaymentMonthly: number
  incomeStreams: IncomeStream[]
  postFireTravelAnnual: number
  eurToRonObservationDate: string | null
  travelDelayLimitMonths: number
  targetAgeOne: number
  targetAgeTwo: number
  targetAgeThree: number
}

export interface YearPoint {
  month: number
  balance: number
  noWithdrawalBalance: number
}

export interface Projection {
  fireMonth: number | null
  fireBalance: number | null
  balanceAtIdealAge: number
  endBalance: number
  noWithdrawalEndBalance: number
  depletionMonth: number | null
  firstIncomeShortfallMonth: number | null
  incomeShortfallTotal: number
  annualDividendIncomeAtFire: number | null
  annualGrossDividendIncomeAtFire: number | null
  balances: YearPoint[]
}

export interface MonteCarloSummary {
  runs: number
  successPercent: number
  fireReachPercent: number
  fireAgeP10: number | null
  fireAgeMedian: number | null
  fireAgeP90: number | null
  endBalanceP10: number
  endBalanceMedian: number
  endBalanceP90: number
}

export interface Scenario {
  mode: RetirementMode
  monthlySpend: number
  annualSpend: number
  fireNumber: number
  projection: Projection
  monteCarlo?: MonteCarloSummary
}

export interface TravelAllowance {
  annualBudget: number | null
  capped: boolean
}

export const DEFAULT_INPUTS: PlanInputs = {
  portfolioSetupMode: 'simple',
  // The advanced allocation starts at the existing all-equity baseline.
  equityAllocationPercent: 100,
  currentEquityAllocationPercent: 100,
  equityNominalReturnPercent: 7,
  equityVolatilityPercent: 15,
  equityAnnualFeePercent: 0.2,
  equityDistributionYieldPercent: 1.9,
  // Editable examples only; no product or market forecast is implied.
  bondNominalReturnPercent: 3,
  bondVolatilityPercent: 3,
  bondAnnualFeePercent: 0.2,
  bondDistributionYieldPercent: 3,
  equityBondCorrelation: 0,
  rebalanceSchedule: 'annually',
  currentAge: 35,
  idealFireAge: 50,
  endAge: 90,
  minimumTerminalBalance: 0,
  // Generic demo values only; actual plan data belongs in browser storage.
  eurPortfolio: 40_000,
  eurUnrealizedGain: 0,
  usdPortfolio: 10_000,
  usdUnrealizedGain: 0,
  // Editable planning placeholder. Replace with a dated rate when refreshing the plan.
  usdToEur: 0.92,
  eurToRon: 4.97,
  annualProfit: 24_000,
  businessReservePercent: 1.5,
  depositFrequency: 'quarterly',
  irregularQuarterlyGross: [6_000, 6_000, 6_000, 6_000],
  nominalReturnPercent: 7,
  inflationPercent: 2.5,
  annualFeePercent: 0.2,
  withdrawalRatePercent: 3.5,
  // Conservative gross cash-yield proxy; rationale and sources live in docs/ASSUMPTIONS_AND_SOURCES.md.
  dividendYieldPercent: 1.9,
  dividendTaxPercent: 0,
  returnOverrides: { swr: null, dividends: null, drawdown: null },
  returnVolatilityPercent: 15,
  monteCarloRuns: 1_000,
  propertyValue: 0,
  propertyMortgageBalance: 0,
  propertyGrossRentMonthly: 0,
  propertyExpensesMonthly: 0,
  propertyMortgagePaymentMonthly: 0,
  incomeStreams: [],
  postFireTravelAnnual: 0,
  eurToRonObservationDate: null,
  travelDelayLimitMonths: 6,
  targetAgeOne: 1_000,
  targetAgeTwo: 1_500,
  targetAgeThree: 2_000,
}

export const STORAGE_KEY = 'northstar-fire-planner-v1'

export function currentPortfolioEur(input: PlanInputs): number {
  return input.eurPortfolio + input.usdPortfolio * input.usdToEur
}

export function currentUnrealizedGainEur(input: PlanInputs): number {
  return input.eurUnrealizedGain + input.usdUnrealizedGain * input.usdToEur
}

export function annualGrossDistributions(input: PlanInputs): number {
  return input.depositFrequency === 'irregular'
    ? input.irregularQuarterlyGross.reduce((sum, value) => sum + value, 0)
    : input.annualProfit
}

export function annualInvestableProfit(input: PlanInputs): number {
  return annualGrossDistributions(input) * (1 - input.businessReservePercent / 100)
}

export interface PortfolioAssumptions {
  nominalReturnPercent: number
  annualFeePercent: number
  netNominalReturnPercent: number
  distributionYieldPercent: number
  volatilityPercent: number
}

export function portfolioAssumptions(input: PlanInputs): PortfolioAssumptions {
  if (input.portfolioSetupMode !== 'power') {
    return {
      nominalReturnPercent: input.nominalReturnPercent,
      annualFeePercent: input.annualFeePercent,
      netNominalReturnPercent: input.nominalReturnPercent - input.annualFeePercent,
      distributionYieldPercent: input.dividendYieldPercent,
      volatilityPercent: input.returnVolatilityPercent,
    }
  }

  const sleeves = [
    {
      id: 'equities', targetWeightPercent: boundedPercent(input.equityAllocationPercent),
      nominalReturnPercent: input.equityNominalReturnPercent,
      volatilityPercent: input.equityVolatilityPercent,
      annualFeePercent: input.equityAnnualFeePercent,
      distributionYieldPercent: input.equityDistributionYieldPercent,
    },
    {
      id: 'bonds', targetWeightPercent: 100 - boundedPercent(input.equityAllocationPercent),
      nominalReturnPercent: input.bondNominalReturnPercent,
      volatilityPercent: input.bondVolatilityPercent,
      annualFeePercent: input.bondAnnualFeePercent,
      distributionYieldPercent: input.bondDistributionYieldPercent,
    },
  ]
  const correlations = {
    equities: { equities: 1, bonds: Math.max(-1, Math.min(1, input.equityBondCorrelation)) },
    bonds: { equities: Math.max(-1, Math.min(1, input.equityBondCorrelation)), bonds: 1 },
  }
  const derived = calculatePortfolioSleeveAssumptions(sleeves, correlations)

  return {
    nominalReturnPercent: derived.weightedGrossNominalReturnPercent,
    annualFeePercent: derived.weightedAnnualFeePercent,
    netNominalReturnPercent: derived.netNominalReturnPercent,
    distributionYieldPercent: derived.weightedCashDistributionYieldPercent,
    volatilityPercent: derived.volatilityPercent,
  }
}

export function swrFireNumber(annualSpend: number, withdrawalRatePercent: number): number {
  const rate = withdrawalRatePercent / 100
  return rate > 0 ? annualSpend / rate : Number.POSITIVE_INFINITY
}

export function dividendFireNumber(annualSpend: number, dividendYieldPercent: number): number {
  const yieldRate = dividendYieldPercent / 100
  return yieldRate > 0 ? annualSpend / yieldRate : Number.POSITIVE_INFINITY
}

export function nominalReturnForMode(input: PlanInputs, mode: RetirementMode): number {
  return input.returnOverrides[mode] ?? portfolioAssumptions(input).nominalReturnPercent
}

export function realAnnualReturn(input: PlanInputs, mode: RetirementMode = 'swr'): number {
  const netNominal = (nominalReturnForMode(input, mode) - portfolioAssumptions(input).annualFeePercent) / 100
  const inflation = input.inflationPercent / 100
  return (1 + netNominal) / (1 + inflation) - 1
}

export function realMonthlyReturn(input: PlanInputs, mode: RetirementMode = 'swr'): number {
  return Math.pow(1 + realAnnualReturn(input, mode), 1 / 12) - 1
}

export function propertyNetRentMonthly(input: PlanInputs): number {
  return input.propertyGrossRentMonthly - input.propertyExpensesMonthly - input.propertyMortgagePaymentMonthly
}

export function incomeAtAge(input: PlanInputs, age: number): number {
  return input.incomeStreams.reduce((sum, stream) => {
    const active = age >= stream.startAge && (stream.endAge === null || age < stream.endAge)
    return sum + (active ? stream.monthlyAmount : 0)
  }, 0)
}

export function monthlyPortfolioNeed(input: PlanInputs, monthlySpend: number, age: number): number {
  return monthlySpend + input.postFireTravelAnnual / 12 - propertyNetRentMonthly(input) - incomeAtAge(input, age)
}

export function drawdownCapitalRequirement(
  input: PlanInputs,
  monthlySpend: number,
  retirementAge: number,
): number {
  const months = Math.max(0, Math.round((input.endAge - retirementAge) * 12))
  const monthlyRate = realMonthlyReturn(input, 'drawdown')
  const safeRate = Math.max(-0.99, monthlyRate)
  if (months === 0) return input.minimumTerminalBalance
  let spendingPresentValue = 0
  for (let month = 1; month <= months; month += 1) {
    const age = retirementAge + month / 12
    const need = monthlyPortfolioNeed(input, monthlySpend, age)
    const discount = Math.abs(safeRate) < 1e-8 ? 1 : Math.pow(1 + safeRate, -month)
    spendingPresentValue += need * discount
  }
  const floorPresentValue = input.minimumTerminalBalance / Math.pow(1 + safeRate, months)
  return Math.max(0, spendingPresentValue + floorPresentValue)
}

export function fireTargetAtAge(
  input: PlanInputs,
  monthlySpend: number,
  mode: RetirementMode,
  age: number,
): number {
  const portfolioSpend = Math.max(0, monthlyPortfolioNeed(input, monthlySpend, age))
  if (mode === 'swr') return swrFireNumber(portfolioSpend * 12, input.withdrawalRatePercent)
  if (mode === 'dividends') {
    const netYieldPercent = portfolioAssumptions(input).distributionYieldPercent * (1 - input.dividendTaxPercent / 100)
    return dividendFireNumber(portfolioSpend * 12, netYieldPercent)
  }
  return drawdownCapitalRequirement(input, monthlySpend, age)
}

function netDepositForMonth(input: PlanInputs, month: number): number {
  const reserveMultiplier = 1 - input.businessReservePercent / 100
  if (input.depositFrequency === 'monthly') {
    return (input.annualProfit / 12) * reserveMultiplier
  }
  if (input.depositFrequency === 'quarterly') {
    return month % 3 === 0 ? (input.annualProfit / 4) * reserveMultiplier : 0
  }
  if (input.depositFrequency === 'yearly') {
    return month % 12 === 0 ? input.annualProfit * reserveMultiplier : 0
  }
  const quarter = Math.floor(((month - 1) % 12) / 3)
  return month % 3 === 0 ? input.irregularQuarterlyGross[quarter] * reserveMultiplier : 0
}

function drawdownTargetsByMonth(input: PlanInputs, monthlySpend: number, horizonMonths: number): number[] {
  const rate = Math.max(-0.99, realMonthlyReturn(input, 'drawdown'))
  const growth = 1 + rate
  const targets = Array.from({ length: horizonMonths + 1 }, () => 0)
  targets[horizonMonths] = input.minimumTerminalBalance

  for (let month = horizonMonths - 1; month >= 0; month -= 1) {
    const nextAge = input.currentAge + (month + 1) / 12
    const nextMonthNeed = monthlyPortfolioNeed(input, monthlySpend, nextAge)
    targets[month] = (nextMonthNeed + targets[month + 1]) / growth
  }

  return targets
}

export function projectRetirement(
  input: PlanInputs,
  monthlySpend: number,
  mode: RetirementMode,
  annualTravelSpend = 0,
  captureMonthlyBalances = false,
): Projection {
  return simulateRetirement(input, monthlySpend, mode, annualTravelSpend, captureMonthlyBalances)
}

function annualGrossDividendIncome(input: PlanInputs, balance: number, sleeveBalances?: Record<string, number>): number {
  if (input.portfolioSetupMode !== 'power' || !sleeveBalances) {
    return balance * input.dividendYieldPercent / 100
  }
  return sleeveBalances.equities * input.equityDistributionYieldPercent / 100
    + sleeveBalances.bonds * input.bondDistributionYieldPercent / 100
}

function powerMonthlyReturnMap(input: PlanInputs, mode: RetirementMode): Record<string, number> {
  return powerSleeveReturns(input, mode)
}

function simulateRetirement(
  input: PlanInputs,
  monthlySpend: number,
  mode: RetirementMode,
  annualTravelSpend = 0,
  captureMonthlyBalances = false,
  monthlyReturns?: number[],
  cachedDrawdownTargets?: number[],
  monthlySleeveReturns?: Record<string, number>[],
): Projection {
  const horizonMonths = Math.max(0, Math.round((input.endAge - input.currentAge) * 12))
  const idealMonths = Math.max(0, Math.round((input.idealFireAge - input.currentAge) * 12))
  const drawdownTargets = mode === 'drawdown'
    ? cachedDrawdownTargets ?? drawdownTargetsByMonth(input, monthlySpend, horizonMonths)
    : undefined
  const targetAt = (month: number, age: number) => drawdownTargets
    ? Math.max(0, drawdownTargets[month] ?? 0)
    : fireTargetAtAge(input, monthlySpend, mode, age)
  const powerSetup = input.portfolioSetupMode === 'power'
  const sleeves = allocationSleeves(input)
  let sleeveBalances = powerSetup
    ? allocateStartingBalance(currentPortfolioEur(input), sleeves)
    : undefined
  let noWithdrawalSleeveBalances = sleeveBalances ? { ...sleeveBalances } : undefined
  let balance = sleeveBalances ? totalSleeveBalance(sleeveBalances) : currentPortfolioEur(input)
  let noWithdrawalBalance = balance
  let fireMonth: number | null = input.currentAge < input.endAge && balance >= targetAt(0, input.currentAge) ? 0 : null
  let fireBalance: number | null = fireMonth === 0 ? balance : null
  let annualGrossDividendIncomeAtFire = mode === 'dividends' && fireMonth === 0
    ? annualGrossDividendIncome(input, balance, sleeveBalances)
    : null
  let annualDividendIncomeAtFire = annualGrossDividendIncomeAtFire === null
    ? null
    : annualGrossDividendIncomeAtFire * (1 - input.dividendTaxPercent / 100)
  let balanceAtIdealAge = idealMonths === 0 ? balance : Number.NaN
  let depletionMonth: number | null = balance <= 0 && fireMonth !== null ? 0 : null
  let firstIncomeShortfallMonth: number | null = null
  let incomeShortfallTotal = 0
  const balances: YearPoint[] = [{ month: 0, balance, noWithdrawalBalance }]
  const monthlyRate = realMonthlyReturn(input, mode)
  const monthlyDividendYield = input.dividendYieldPercent / 100 / 12
  const deterministicSleeveReturns = powerSetup ? powerMonthlyReturnMap(input, mode) : undefined

  for (let month = 1; month <= horizonMonths; month += 1) {
    const rate = monthlyReturns?.[month - 1] ?? monthlyRate
    const ageAtMonthEnd = input.currentAge + month / 12
    if (fireMonth === null) {
      const netPreFireCashflow = netDepositForMonth(input, month) + propertyNetRentMonthly(input) - annualTravelSpend / 12
      if (sleeveBalances && noWithdrawalSleeveBalances && deterministicSleeveReturns) {
        const returns = monthlySleeveReturns?.[month - 1] ?? deterministicSleeveReturns
        sleeveBalances = applySleeveReturns(sleeveBalances, returns)
        sleeveBalances = applyPortfolioCashflow(sleeveBalances, netPreFireCashflow, sleeves)
        sleeveBalances = rebalanceToTargetWeights(sleeveBalances, sleeves, input.rebalanceSchedule, month)
        noWithdrawalSleeveBalances = { ...sleeveBalances }
        balance = totalSleeveBalance(sleeveBalances)
        noWithdrawalBalance = totalSleeveBalance(noWithdrawalSleeveBalances)
      } else {
        balance = Math.max(0, balance * (1 + rate) + netPreFireCashflow)
        noWithdrawalBalance = balance
      }

      if (ageAtMonthEnd < input.endAge && balance >= targetAt(month, ageAtMonthEnd)) {
        fireMonth = month
        fireBalance = balance
        if (mode === 'dividends') {
          annualGrossDividendIncomeAtFire = annualGrossDividendIncome(input, balance, sleeveBalances)
          annualDividendIncomeAtFire = annualGrossDividendIncomeAtFire * (1 - input.dividendTaxPercent / 100)
        }
      }
    } else {
      const returns = monthlySleeveReturns?.[month - 1] ?? deterministicSleeveReturns
      const openingSleeveBalances = sleeveBalances ? { ...sleeveBalances } : undefined
      if (sleeveBalances && noWithdrawalSleeveBalances && returns) {
        noWithdrawalSleeveBalances = applySleeveReturns(noWithdrawalSleeveBalances, returns)
        noWithdrawalSleeveBalances = rebalanceToTargetWeights(noWithdrawalSleeveBalances, sleeves, input.rebalanceSchedule, month)
        noWithdrawalBalance = totalSleeveBalance(noWithdrawalSleeveBalances)
        sleeveBalances = applySleeveReturns(sleeveBalances, returns)
      } else {
        noWithdrawalBalance *= 1 + rate
      }
      const totalNeed = monthlySpend + input.postFireTravelAnnual / 12
      const externalIncome = propertyNetRentMonthly(input) + incomeAtAge(input, ageAtMonthEnd)
      if (mode === 'dividends') {
        const dividendCash = sleeveBalances
          ? annualGrossDividendIncome(input, totalSleeveBalance(openingSleeveBalances ?? sleeveBalances), openingSleeveBalances ?? sleeveBalances) / 12
          : balance * monthlyDividendYield
        const dividendTax = dividendCash * input.dividendTaxPercent / 100
        const needFromDividends = Math.max(0, totalNeed - externalIncome)
        const cashSpent = Math.min(needFromDividends, dividendCash - dividendTax)
        const externalSurplus = Math.max(0, externalIncome - totalNeed)
        const shortfall = Math.max(0, needFromDividends - (dividendCash - dividendTax))
        incomeShortfallTotal += shortfall
        if (shortfall > 0 && firstIncomeShortfallMonth === null) firstIncomeShortfallMonth = month
        // Total return includes gross distributions. Subtract tax and cash actually spent;
        // unspent net distributions remain invested.
        if (sleeveBalances && deterministicSleeveReturns) {
          sleeveBalances = applyPortfolioCashflow(sleeveBalances, -dividendTax - cashSpent + externalSurplus, sleeves)
          sleeveBalances = rebalanceToTargetWeights(sleeveBalances, sleeves, input.rebalanceSchedule, month)
          balance = totalSleeveBalance(sleeveBalances)
        } else {
          balance = Math.max(0, balance * (1 + rate) - dividendTax - cashSpent + externalSurplus)
        }
      } else {
        if (sleeveBalances && deterministicSleeveReturns) {
          sleeveBalances = applyPortfolioCashflow(sleeveBalances, -totalNeed + externalIncome, sleeves)
          sleeveBalances = rebalanceToTargetWeights(sleeveBalances, sleeves, input.rebalanceSchedule, month)
          balance = totalSleeveBalance(sleeveBalances)
        } else {
          balance = Math.max(0, balance * (1 + rate) - totalNeed + externalIncome)
        }
      }
      if (balance <= 0 && depletionMonth === null) depletionMonth = month
    }

    if (month === idealMonths) balanceAtIdealAge = balance
    if (captureMonthlyBalances || month % 12 === 0 || month === fireMonth || month === depletionMonth || month === horizonMonths) {
      balances.push({ month, balance, noWithdrawalBalance })
    }
  }

  if (!Number.isFinite(balanceAtIdealAge)) balanceAtIdealAge = balance

  return {
    fireMonth,
    fireBalance,
    balanceAtIdealAge,
    endBalance: balance,
    noWithdrawalEndBalance: noWithdrawalBalance,
    depletionMonth,
    firstIncomeShortfallMonth,
    incomeShortfallTotal,
    annualDividendIncomeAtFire,
    annualGrossDividendIncomeAtFire,
    balances,
  }
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

function normalRandom(random: () => number): number {
  const u1 = Math.max(Number.EPSILON, random())
  const u2 = random()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))]
}

export function runMonteCarlo(
  input: PlanInputs,
  monthlySpend: number,
  mode: RetirementMode,
): MonteCarloSummary {
  const runs = Math.max(100, Math.min(10_000, Math.round(input.monteCarloRuns)))
  const horizonMonths = Math.max(0, Math.round((input.endAge - input.currentAge) * 12))
  const portfolio = portfolioAssumptions(input)
  const volatility = Math.max(0, portfolio.volatilityPercent / 100)
  const nominalMean = (nominalReturnForMode(input, mode) - portfolio.annualFeePercent) / 100
  const logMeanAnnual = Math.log(Math.max(0.001, 1 + nominalMean)) - volatility * volatility / 2
  const monthlyLogMean = logMeanAnnual / 12
  const monthlyLogDeviation = volatility / Math.sqrt(12)
  const monthlyInflationFactor = Math.pow(1 + input.inflationPercent / 100, 1 / 12)
  const seedString = [mode, input.currentAge, input.endAge, input.nominalReturnPercent,
    nominalReturnForMode(input, mode), portfolio.volatilityPercent, input.portfolioSetupMode,
    input.equityAllocationPercent, input.currentEquityAllocationPercent,
    input.equityNominalReturnPercent, input.equityVolatilityPercent, input.equityAnnualFeePercent,
    input.equityDistributionYieldPercent, input.bondNominalReturnPercent, input.bondVolatilityPercent,
    input.bondAnnualFeePercent, input.bondDistributionYieldPercent, input.equityBondCorrelation,
    input.rebalanceSchedule, monthlySpend,
    input.postFireTravelAnnual, input.dividendTaxPercent, input.propertyValue,
    input.propertyMortgageBalance, runs].join('|')
  const seed = Array.from(seedString).reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16_777_619), 2_166_136_261)
  const random = seededRandom(seed)
  const endings: number[] = []
  const fireAges: number[] = []
  let successful = 0
  let reachedFire = 0
  const floor = input.minimumTerminalBalance
  const drawdownTargets = mode === 'drawdown'
    ? drawdownTargetsByMonth(input, monthlySpend, horizonMonths)
    : undefined
  const powerModeReturnAdjustment = nominalReturnForMode(input, mode) - portfolio.nominalReturnPercent
  const powerReturnRuns = input.portfolioSetupMode === 'power'
    ? iteratePortfolioSequenceRuns(
      [
        {
          id: 'equities',
          nominalReturnPercent: input.equityNominalReturnPercent + powerModeReturnAdjustment - input.equityAnnualFeePercent,
          volatilityPercent: input.equityVolatilityPercent,
        },
        {
          id: 'bonds',
          nominalReturnPercent: input.bondNominalReturnPercent + powerModeReturnAdjustment - input.bondAnnualFeePercent,
          volatilityPercent: input.bondVolatilityPercent,
        },
      ],
      {
        equities: { equities: 1, bonds: Math.max(-1, Math.min(1, input.equityBondCorrelation)) },
        bonds: { equities: Math.max(-1, Math.min(1, input.equityBondCorrelation)), bonds: 1 },
      },
      horizonMonths,
      runs,
      seed,
    )
    : undefined

  for (let run = 0; run < runs; run += 1) {
    const powerMonthlyPath = powerReturnRuns?.next().value
    const projection = powerMonthlyPath
      ? simulateRetirement(
        input,
        monthlySpend,
        mode,
        0,
        false,
        undefined,
        drawdownTargets,
        powerMonthlyPath.map((monthReturns) => Object.fromEntries(
          monthReturns.map(({ sleeveId, return: monthlyReturn }) => [sleeveId, (1 + monthlyReturn) / monthlyInflationFactor - 1]),
        )),
      )
      : simulateRetirement(
        input,
        monthlySpend,
        mode,
        0,
        false,
        Array.from({ length: horizonMonths }, () =>
          Math.exp(monthlyLogMean + monthlyLogDeviation * normalRandom(random)) / monthlyInflationFactor - 1,
        ),
        drawdownTargets,
      )
    endings.push(projection.endBalance)
    if (projection.fireMonth !== null) {
      reachedFire += 1
      fireAges.push(input.currentAge + projection.fireMonth / 12)
    }
    const funded = projection.fireMonth !== null
      && projection.depletionMonth === null
      && projection.endBalance + 1 >= floor
      && (mode !== 'dividends' || projection.incomeShortfallTotal < 0.01)
    if (funded) successful += 1
  }

  return {
    runs,
    successPercent: successful / runs * 100,
    fireReachPercent: reachedFire / runs * 100,
    fireAgeP10: fireAges.length ? percentile(fireAges, 0.1) : null,
    fireAgeMedian: fireAges.length ? percentile(fireAges, 0.5) : null,
    fireAgeP90: fireAges.length ? percentile(fireAges, 0.9) : null,
    endBalanceP10: percentile(endings, 0.1),
    endBalanceMedian: percentile(endings, 0.5),
    endBalanceP90: percentile(endings, 0.9),
  }
}

export function calculateTravelAllowance(
  input: PlanInputs,
  monthlySpend: number,
  mode: RetirementMode,
  delayLimitMonths: number,
): TravelAllowance {
  const baseline = projectRetirement(input, monthlySpend, mode).fireMonth
  if (baseline === null) return { annualBudget: null, capped: false }

  let low = 0
  let high = 200_000
  for (let iteration = 0; iteration < 42; iteration += 1) {
    const candidate = (low + high) / 2
    const fireMonth = projectRetirement(input, monthlySpend, mode, candidate).fireMonth
    const delay = fireMonth === null ? Number.POSITIVE_INFINITY : fireMonth - baseline
    if (delay <= delayLimitMonths) low = candidate
    else high = candidate
  }

  return { annualBudget: low, capped: low > 199_990 }
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  result.setMonth(result.getMonth() + months)
  return result
}

export function formatFireAge(currentAge: number, fireMonth: number | null): string {
  if (fireMonth === null) return 'Not reached by end age'
  return (currentAge + fireMonth / 12).toFixed(1)
}
