import {
  DEFAULT_INPUTS,
  RETIREMENT_MODES,
  STORAGE_KEY,
} from './model'
import type { IncomeStream, PlanInputs } from './model'

const NUMERIC_FIELDS = [
  'equityAllocationPercent',
  'currentEquityAllocationPercent',
  'equityNominalReturnPercent',
  'equityVolatilityPercent',
  'equityAnnualFeePercent',
  'equityDistributionYieldPercent',
  'bondNominalReturnPercent',
  'bondVolatilityPercent',
  'bondAnnualFeePercent',
  'bondDistributionYieldPercent',
  'equityBondCorrelation',
  'currentAge',
  'idealFireAge',
  'endAge',
  'minimumTerminalBalance',
  'eurPortfolio',
  'eurUnrealizedGain',
  'usdPortfolio',
  'usdUnrealizedGain',
  'usdToEur',
  'eurToRon',
  'annualProfit',
  'businessReservePercent',
  'nominalReturnPercent',
  'inflationPercent',
  'annualFeePercent',
  'withdrawalRatePercent',
  'dividendYieldPercent',
  'dividendTaxPercent',
  'returnVolatilityPercent',
  'monteCarloRuns',
  'propertyValue',
  'propertyMortgageBalance',
  'propertyGrossRentMonthly',
  'propertyExpensesMonthly',
  'propertyMortgagePaymentMonthly',
  'postFireTravelAnnual',
  'travelDelayLimitMonths',
  'targetAgeOne',
  'targetAgeTwo',
  'targetAgeThree',
] as const satisfies readonly (keyof PlanInputs)[]

const NEGATIVE_ALLOWED_FIELDS = new Set<keyof PlanInputs>([
  'equityBondCorrelation',
  'equityNominalReturnPercent',
  'bondNominalReturnPercent',
  'nominalReturnPercent',
  'inflationPercent',
  'eurUnrealizedGain',
  'usdUnrealizedGain',
])
const RETURN_FIELDS = [
  'equityNominalReturnPercent',
  'bondNominalReturnPercent',
  'nominalReturnPercent',
  'inflationPercent',
] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function invalid(field: string, expectation: string): never {
  throw new TypeError(`Invalid plan field "${field}": expected ${expectation}`)
}

export function createDefaultPlanInputs(): PlanInputs {
  return {
    ...DEFAULT_INPUTS,
    irregularQuarterlyGross: [...DEFAULT_INPUTS.irregularQuarterlyGross],
    returnOverrides: { ...DEFAULT_INPUTS.returnOverrides },
    incomeStreams: DEFAULT_INPUTS.incomeStreams.map((stream) => ({ ...stream })),
  }
}

function parseIncomeStreams(value: unknown): IncomeStream[] {
  if (!Array.isArray(value)) invalid('incomeStreams', 'an array')

  return value.map((item, index) => {
    const prefix = `incomeStreams[${index}]`
    if (!isRecord(item)) invalid(prefix, 'an object')
    if (typeof item.id !== 'string' || item.id.length === 0) invalid(`${prefix}.id`, 'a non-empty string')
    if (typeof item.name !== 'string') invalid(`${prefix}.name`, 'a string')
    for (const field of ['monthlyAmount', 'startAge'] as const) {
      if (typeof item[field] !== 'number' || !Number.isFinite(item[field])) {
        invalid(`${prefix}.${field}`, 'a finite number')
      }
      if (item[field] < 0) invalid(`${prefix}.${field}`, 'a non-negative number')
    }
    const endAge = item.endAge === undefined ? null : item.endAge
    if (endAge !== null && (typeof endAge !== 'number' || !Number.isFinite(endAge))) {
      invalid(`${prefix}.endAge`, 'a finite number or null')
    }
    if (typeof endAge === 'number' && endAge < 0) invalid(`${prefix}.endAge`, 'a non-negative number or null')

    return {
      id: item.id,
      name: item.name,
      monthlyAmount: item.monthlyAmount as number,
      startAge: item.startAge as number,
      endAge,
    }
  })
}

function parseReturnOverrides(value: unknown, defaults: PlanInputs['returnOverrides']): PlanInputs['returnOverrides'] {
  if (!isRecord(value)) invalid('returnOverrides', 'an object')

  const overrides = { ...defaults }
  for (const mode of RETIREMENT_MODES) {
    if (!Object.hasOwn(value, mode)) continue
    const override = value[mode]
    if (override !== null && (typeof override !== 'number' || !Number.isFinite(override))) {
      invalid(`returnOverrides.${mode}`, 'a finite number or null')
    }
    if (typeof override === 'number' && override < -100) {
      invalid(`returnOverrides.${mode}`, 'a number no lower than -100 or null')
    }
    overrides[mode] = override as number | null
  }
  return overrides
}

/** Merge older plan shapes over defaults, while rejecting malformed known fields. */
export function parsePlanInputs(value: unknown): PlanInputs {
  if (!isRecord(value)) invalid('plan', 'an object')

  const defaults = createDefaultPlanInputs()
  const knownFields = Object.fromEntries(
    Object.entries(value).filter(([key]) => Object.hasOwn(DEFAULT_INPUTS, key)),
  )
  const plan = { ...defaults, ...knownFields } as PlanInputs

  for (const field of NUMERIC_FIELDS) {
    if (typeof plan[field] !== 'number' || !Number.isFinite(plan[field])) {
      invalid(field, 'a finite number')
    }
    if (!NEGATIVE_ALLOWED_FIELDS.has(field) && plan[field] < 0) {
      invalid(field, 'a non-negative finite number')
    }
  }

  for (const field of RETURN_FIELDS) {
    if (plan[field] < -100 || (field === 'inflationPercent' && plan[field] === -100)) {
      invalid(field, field === 'inflationPercent' ? 'a number greater than -100' : 'a number no lower than -100')
    }
  }

  for (const field of ['equityAllocationPercent', 'currentEquityAllocationPercent', 'businessReservePercent', 'dividendTaxPercent'] as const) {
    if (plan[field] > 100) invalid(field, 'a number in [0, 100]')
  }
  if (plan.equityBondCorrelation < -1 || plan.equityBondCorrelation > 1) {
    invalid('equityBondCorrelation', 'a number in [-1, 1]')
  }
  if (plan.monteCarloRuns < 100 || plan.monteCarloRuns > 10_000) {
    invalid('monteCarloRuns', 'a number in [100, 10000]')
  }
  if (plan.usdToEur === 0 || plan.eurToRon === 0) {
    invalid('usdToEur/eurToRon', 'a positive exchange rate')
  }

  if (!['simple', 'power'].includes(plan.portfolioSetupMode)) {
    invalid('portfolioSetupMode', '"simple" or "power"')
  }
  if (!['never', 'monthly', 'annually'].includes(plan.rebalanceSchedule)) {
    invalid('rebalanceSchedule', '"never", "monthly", or "annually"')
  }
  if (!['monthly', 'quarterly', 'yearly', 'irregular'].includes(plan.depositFrequency)) {
    invalid('depositFrequency', 'a supported deposit frequency')
  }

  if (!Array.isArray(plan.irregularQuarterlyGross) || plan.irregularQuarterlyGross.length !== 4
    || plan.irregularQuarterlyGross.some((amount) => typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0)) {
    invalid('irregularQuarterlyGross', 'an array of four non-negative finite numbers')
  }
  plan.returnOverrides = parseReturnOverrides(plan.returnOverrides, defaults.returnOverrides)
  plan.incomeStreams = parseIncomeStreams(plan.incomeStreams)

  if (plan.eurToRonObservationDate !== null && typeof plan.eurToRonObservationDate !== 'string') {
    invalid('eurToRonObservationDate', 'a string or null')
  }

  return plan
}

export function loadSavedPlan(storage?: Pick<Storage, 'getItem'>): PlanInputs {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(STORAGE_KEY)
    return raw ? parsePlanInputs(JSON.parse(raw)) : createDefaultPlanInputs()
  } catch {
    return createDefaultPlanInputs()
  }
}
