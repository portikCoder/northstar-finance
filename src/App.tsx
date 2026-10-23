import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import {
  addMonths,
  annualInvestableProfit,
  calculateTravelAllowance,
  currentPortfolioEur,
  currentUnrealizedGainEur,
  DEFAULT_INPUTS,
  fireTargetAtAge,
  formatFireAge,
  portfolioAssumptions,
  propertyNetRentMonthly,
  projectRetirement,
  RETIREMENT_MODES,
  STORAGE_KEY,
} from './model'
import type { DisplayCurrency, IncomeStream, MonteCarloSummary, PlanInputs, RetirementMode, Scenario } from './model'
import { comparePortfolioOutcomes } from './portfolioComparison'

type NumericKey = {
  [Key in keyof PlanInputs]: PlanInputs[Key] extends number ? Key : never
}[keyof PlanInputs]

const MODE_META: Record<RetirementMode, { title: string; short: string; color: string; description: string }> = {
  swr: {
    title: 'Total-return withdrawals',
    short: 'TOTAL RETURN',
    color: '#b6ca8e',
    description: 'Draw a fixed, inflation-adjusted spending amount from total portfolio return. Dividends and asset sales can both fund spending.',
  },
  dividends: {
    title: 'Dividend income only',
    short: 'DIVIDENDS ONLY',
    color: '#81c5b1',
    description: 'Spend net cash distributions after the editable effective dividend-tax assumption. Do not sell shares to cover a shortfall; the app reports any income gap separately.',
  },
  drawdown: {
    title: 'Planned drawdown',
    short: 'PLANNED DRAWDOWN',
    color: '#e6c46d',
    description: 'Plan to fund spending through the selected end age and leave the configured minimum balance behind.',
  },
}

function loadSavedPlan(): PlanInputs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_INPUTS
    return { ...DEFAULT_INPUTS, ...JSON.parse(raw) } as PlanInputs
  } catch {
    return DEFAULT_INPUTS
  }
}

function formatMoney(value: number, currency: DisplayCurrency, compact = false): string {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-IE', {
    style: 'currency',
    currency,
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? 'compact' : 'standard',
  }).format(value)
}

function formatDate(months: number | null, endAge?: number): string {
  if (months === null) return endAge === undefined ? 'Not reached' : `Not by age ${endAge}`
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(
    addMonths(new Date(), months),
  )
}

function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="info-tip-wrap">
      <button type="button" className="info-dot" aria-label={`More information: ${label}`}>i</button>
      <span className="info-tooltip" role="tooltip">
        <b>{label}</b>
        <span>{children}</span>
      </span>
    </span>
  )
}

function InputField({
  label,
  name,
  value,
  onChange,
  step = 'any',
  min = 0,
  max,
  suffix,
  hint,
  info,
}: {
  label: string
  name: string
  value: number
  onChange: (value: number) => void
  step?: string
  min?: number
  max?: number
  suffix?: string
  hint?: string
  info?: ReactNode
}) {
  return (
    <div className="input-field">
      <span className="label-row">
        <label className="input-label" htmlFor={name}>{label}</label>
        {info && <InfoTip label={label}>{info}</InfoTip>}
      </span>
      <span className="input-wrap">
        <input
          id={name}
          name={name}
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number.isFinite(value) ? value : ''}
          onChange={(event) => onChange(event.currentTarget.value === '' ? 0 : Number(event.currentTarget.value))}
        />
        {suffix && <span className="input-suffix">{suffix}</span>}
      </span>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  )
}

function ProjectionChart({
  scenarios,
  inputs,
  currency,
}: {
  scenarios: Scenario[]
  inputs: PlanInputs
  currency: DisplayCurrency
}) {
  const width = 850
  const height = 300
  const left = 67
  const right = 20
  const top = 25
  const bottom = 39
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const horizonMonths = Math.max(1, Math.round((inputs.endAge - inputs.currentAge) * 12))
  const points = scenarios.flatMap((scenario) => scenario.projection.balances)
  const maxValue = Math.max(1, ...points.flatMap((point) => [point.balance, point.noWithdrawalBalance]))
  const y = (value: number) => top + plotHeight - (value / maxValue) * plotHeight
  const toDisplay = (value: number) => currency === 'EUR' ? value : value * inputs.eurToRon
  const [zoomLevel, setZoomLevel] = useState(1)
  const [viewStartMonth, setViewStartMonth] = useState(0)
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null)
  const [hoverPosition, setHoverPosition] = useState<{ x: number; y: number } | null>(null)
  const [pinnedMonth, setPinnedMonth] = useState<number | null>(null)
  const [focusedMode, setFocusedMode] = useState<RetirementMode | null>(null)
  const [showCounterfactual, setShowCounterfactual] = useState(true)
  const visibleMonths = horizonMonths / zoomLevel
  const maxViewStart = Math.max(0, horizonMonths - visibleMonths)
  const viewStart = Math.max(0, Math.min(viewStartMonth, maxViewStart))
  const viewEnd = viewStart + visibleMonths
  const x = (month: number) => left + ((month - viewStart) / visibleMonths) * plotWidth
  const stepYears = Math.max(1, Math.ceil((visibleMonths / 12) / 5))
  const firstTickAge = Math.ceil((inputs.currentAge + viewStart / 12) / stepYears) * stepYears
  const ages: number[] = []
  for (let age = firstTickAge; age <= inputs.currentAge + viewEnd / 12; age += stepYears) ages.push(age)
  if (inputs.idealFireAge >= inputs.currentAge + viewStart / 12 && inputs.idealFireAge <= inputs.currentAge + viewEnd / 12) {
    ages.push(inputs.idealFireAge)
  }
  if (!ages.some((age) => Math.abs(age - inputs.currentAge - viewStart / 12) < 0.1)) {
    ages.unshift(Math.ceil(inputs.currentAge + viewStart / 12))
  }
  if (viewEnd >= horizonMonths && !ages.includes(inputs.endAge)) ages.push(inputs.endAge)
  const chartAges = Array.from(new Set(ages)).sort((a, b) => a - b)
  const inspectMonth = hoveredMonth ?? pinnedMonth
  const inspectedAge = inspectMonth === null ? null : inputs.currentAge + inspectMonth / 12
  const tooltipX = inspectMonth === null
    ? 50
    : hoveredMonth !== null && hoverPosition !== null
      ? hoverPosition.x
      : Math.max(5, Math.min(95, (x(inspectMonth) / width) * 100))
  const tooltipY = hoveredMonth !== null && hoverPosition !== null ? hoverPosition.y : 7

  function updateZoom(factor: number) {
    const nextZoom = Math.max(1, Math.min(12, zoomLevel * factor))
    const center = viewStart + visibleMonths / 2
    const nextVisibleMonths = horizonMonths / nextZoom
    setZoomLevel(nextZoom)
    setViewStartMonth(Math.max(0, Math.min(horizonMonths - nextVisibleMonths, center - nextVisibleMonths / 2)))
  }

  function inspectAtPointer(event: ReactPointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * width
    const pointerY = ((event.clientY - bounds.top) / bounds.height) * height
    const fraction = Math.max(0, Math.min(1, (pointerX - left) / plotWidth))
    setHoveredMonth(Math.round(viewStart + fraction * visibleMonths))
    setHoverPosition({
      x: Math.max(5, Math.min(95, (pointerX / width) * 100)),
      y: Math.max(5, Math.min(95, (pointerY / height) * 100)),
    })
  }

  function pinAtPointer(event: ReactMouseEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * width
    const fraction = Math.max(0, Math.min(1, (pointerX - left) / plotWidth))
    const month = Math.round(viewStart + fraction * visibleMonths)
    setPinnedMonth((current) => current === month ? null : month)
  }

  if (scenarios.length === 0) {
    return <div className="empty-chart">Select one or more retirement approaches to show their paths.</div>
  }

  return (
    <div className="chart-wrap">
      <div className="chart-toolbar" aria-label="Chart controls">
        <div className="chart-navigation">
          <button type="button" onClick={() => setViewStartMonth(Math.max(0, viewStart - visibleMonths * 0.35))} disabled={viewStart <= 0} aria-label="Pan graph earlier">←</button>
          <button type="button" onClick={() => updateZoom(1 / 1.5)} disabled={zoomLevel <= 1.001} aria-label="Zoom out">−</button>
          <span>{Math.round(zoomLevel * 100)}%</span>
          <button type="button" onClick={() => updateZoom(1.5)} disabled={zoomLevel >= 11.99} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => setViewStartMonth(Math.min(maxViewStart, viewStart + visibleMonths * 0.35))} disabled={viewStart >= maxViewStart} aria-label="Pan graph later">→</button>
          <button type="button" onClick={() => { setZoomLevel(1); setViewStartMonth(0); setPinnedMonth(null) }}>Reset view</button>
        </div>
        <button type="button" className="counterfactual-toggle" aria-pressed={showCounterfactual} onClick={() => setShowCounterfactual((visible) => !visible)}>
          {showCounterfactual ? 'Hide' : 'Show'} no-withdrawal paths
        </button>
      </div>
      <div className="chart-canvas">
      <svg
        className="projection-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Interactive portfolio paths. Move over the graph to inspect values; click to pin an age for comparison."
        onPointerMove={inspectAtPointer}
        onPointerLeave={() => { setHoveredMonth(null); setHoverPosition(null) }}
        onClick={pinAtPointer}
      >
        <defs>
          <clipPath id="projection-chart-plot-clip">
            <rect x={left} y={top} width={plotWidth} height={plotHeight} />
          </clipPath>
        </defs>
        {[0, 0.5, 1].map((fraction) => {
          const tickY = top + plotHeight * fraction
          const displayValue = toDisplay(maxValue * (1 - fraction))
          return (
            <g key={fraction}>
              <line x1={left} x2={width - right} y1={tickY} y2={tickY} className="chart-grid" />
              <text x={left - 10} y={tickY + 4} textAnchor="end" className="chart-label">{formatMoney(displayValue, currency, true)}</text>
            </g>
          )
        })}
        {chartAges.map((age) => {
          const month = Math.round((age - inputs.currentAge) * 12)
          return <text key={age} x={x(month)} y={height - 10} textAnchor="middle" className="chart-label">Age {Math.round(age)}</text>
        })}
        {scenarios.map((scenario) => {
          const meta = MODE_META[scenario.mode]
          const fromIndex = scenario.projection.balances.findIndex((point) => point.month >= viewStart)
          const toIndex = scenario.projection.balances.findIndex((point) => point.month > viewEnd)
          const visiblePoints = scenario.projection.balances.slice(
            Math.max(0, fromIndex < 0 ? 0 : fromIndex - 1),
            toIndex < 0 ? undefined : toIndex + 1,
          )
          const actualPath = visiblePoints
            .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.month)} ${y(point.balance)}`)
            .join(' ')
          const counterfactualPath = visiblePoints
            .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.month)} ${y(point.noWithdrawalBalance)}`)
            .join(' ')
          const dimmed = focusedMode !== null && focusedMode !== scenario.mode
          return (
            <g key={scenario.mode} opacity={dimmed ? 0.18 : 1} clipPath="url(#projection-chart-plot-clip)">
              {scenario.projection.fireMonth !== null && (
                <line x1={x(scenario.projection.fireMonth)} x2={x(scenario.projection.fireMonth)} y1={top} y2={top + plotHeight} className="fire-marker" stroke={meta.color} />
              )}
              {showCounterfactual && <path d={counterfactualPath} fill="none" stroke={meta.color} className="counterfactual-line" />}
              <path d={actualPath} fill="none" stroke={meta.color} className="portfolio-line" />
              {scenario.projection.fireMonth !== null && (
                <circle cx={x(scenario.projection.fireMonth)} cy={y(scenario.projection.fireBalance ?? 0)} r="3.5" fill={meta.color} className="fire-point" />
              )}
              {inspectMonth !== null && (() => {
                const inspected = scenario.projection.balances.find((point) => point.month === inspectMonth)
                return inspected ? <circle cx={x(inspectMonth)} cy={y(inspected.balance)} r="4" fill={meta.color} className="inspect-point" /> : null
              })()}
            </g>
          )
        })}
        {inspectMonth !== null && (
          <line x1={x(inspectMonth)} x2={x(inspectMonth)} y1={top} y2={top + plotHeight} className="inspect-line" />
        )}
      </svg>
      {inspectMonth !== null && (
        <div
          className="chart-hover-card"
          aria-hidden="true"
          style={{
            left: `${tooltipX}%`,
            top: `${tooltipY}%`,
            transform: `translate(${tooltipX > 62 ? '-100%' : '0'}, ${tooltipY > 62 ? '-100%' : '0'})`,
          }}
        >
          <b className="chart-hover-age">Age {inspectedAge!.toFixed(1)}</b>
          {scenarios.map((scenario) => {
            const inspected = scenario.projection.balances.find((point) => point.month === inspectMonth)
            return inspected ? (
              <div key={scenario.mode} className="chart-hover-mode" style={{ '--mode-color': MODE_META[scenario.mode].color } as CSSProperties}>
                <b>{MODE_META[scenario.mode].short}</b>
                <span><i>Spend-adjusted</i><strong>{formatMoney(toDisplay(inspected.balance), currency)}</strong></span>
                {showCounterfactual && <span><i>No withdrawals</i><strong>{formatMoney(toDisplay(inspected.noWithdrawalBalance), currency)}</strong></span>}
              </div>
            ) : null
          })}
        </div>
      )}
      </div>
      <div className="chart-inspector">
        <label htmlFor="chart-age-range">Inspect age {inspectedAge === null ? '—' : inspectedAge.toFixed(1)}</label>
        <input
          id="chart-age-range"
          type="range"
          min={Math.round(viewStart)}
          max={Math.max(Math.round(viewStart) + 1, Math.round(viewEnd))}
          value={inspectMonth ?? Math.round(viewStart)}
          onChange={(event) => setPinnedMonth(Number(event.currentTarget.value))}
          onFocus={() => {
            if (pinnedMonth === null && hoveredMonth !== null) setPinnedMonth(hoveredMonth)
            setHoveredMonth(null)
          }}
          aria-label="Select age to compare portfolio values"
          aria-valuetext={`Age ${(inputs.currentAge + (inspectMonth ?? Math.round(viewStart)) / 12).toFixed(1)}`}
        />
        <span className="chart-inspector-hint">Move over the graph or use the slider; click the graph to pin an age.</span>
        {inspectMonth !== null && (
          <div className="chart-readout" aria-live="polite">
            <div className="chart-readout-heading">
              <b>Compare at age {inspectedAge!.toFixed(1)}</b>
              <button type="button" onClick={() => setPinnedMonth((month) => month === inspectMonth ? null : inspectMonth)}>
                {pinnedMonth === inspectMonth ? 'Unpin age' : 'Pin age'}
              </button>
            </div>
            <div className="chart-readout-grid">
              {scenarios.map((scenario) => {
                const inspected = scenario.projection.balances.find((point) => point.month === inspectMonth)
                return inspected ? (
                  <article key={scenario.mode} style={{ '--mode-color': MODE_META[scenario.mode].color } as CSSProperties}>
                    <b>{MODE_META[scenario.mode].short}</b>
                    <span>Spend-adjusted <strong>{formatMoney(toDisplay(inspected.balance), currency)}</strong></span>
                    {showCounterfactual && <span>No withdrawals <strong>{formatMoney(toDisplay(inspected.noWithdrawalBalance), currency)}</strong></span>}
                  </article>
                ) : null
              })}
            </div>
          </div>
        )}
      </div>
      <div className="chart-legend">
        {scenarios.map((scenario) => (
          <button
            key={scenario.mode}
            type="button"
            className="legend-mode"
            aria-pressed={focusedMode === scenario.mode}
            onClick={() => setFocusedMode((mode) => mode === scenario.mode ? null : scenario.mode)}
            title={`Focus ${MODE_META[scenario.mode].title}`}
          ><i style={{ backgroundColor: MODE_META[scenario.mode].color }} />{MODE_META[scenario.mode].short}</button>
        ))}
        <span><i className="legend-solid" />Spend-adjusted value</span>
        {showCounterfactual && <span><i className="legend-dotted" />Growth, no withdrawals</span>}
        <span><i className="legend-fire" />FIRE date</span>
      </div>
    </div>
  )
}

function ModeCard({ scenario, inputs, currency }: {
  scenario: Scenario
  inputs: PlanInputs
  currency: DisplayCurrency
}) {
  const meta = MODE_META[scenario.mode]
  const portfolioRates = portfolioAssumptions(inputs)
  const convert = (amount: number) => currency === 'EUR' ? amount : amount * inputs.eurToRon
  const money = (amount: number) => formatMoney(convert(amount), currency)
  const projection = scenario.projection
  const depletionAge = projection.depletionMonth === null
    ? null
    : inputs.currentAge + projection.depletionMonth / 12
  const terminalFloorMet = projection.endBalance + 1 >= inputs.minimumTerminalBalance

  let outcome: string
  let outcomeClass = 'outcome-good'
  if (projection.fireMonth === null) {
    outcome = `Not reached by age ${inputs.endAge}`
    outcomeClass = 'outcome-warn'
  } else if (scenario.mode === 'dividends' && projection.incomeShortfallTotal > 0) {
    outcome = `${money(projection.incomeShortfallTotal)} income gap by ${inputs.endAge}`
    outcomeClass = 'outcome-warn'
  } else if (scenario.mode === 'drawdown' && !terminalFloorMet) {
    outcome = 'Terminal floor not met'
    outcomeClass = 'outcome-warn'
  } else if (scenario.mode === 'drawdown') {
    outcome = `Terminal floor met · ${money(projection.endBalance)} at ${inputs.endAge}`
  } else if (depletionAge !== null) {
    outcome = `Portfolio depleted at ${depletionAge.toFixed(1)}`
    outcomeClass = 'outcome-danger'
  } else {
    outcome = `${money(projection.endBalance)} at age ${inputs.endAge}`
  }

  return (
    <article className="mode-card" style={{ '--mode-color': meta.color } as CSSProperties}>
      <div className="mode-card-head">
        <span className="mode-title">{meta.title}</span>
        <InfoTip label={meta.title}>{meta.description}</InfoTip>
      </div>
      <div className="mode-number-label">{scenario.mode === 'drawdown' ? 'CAPITAL NEEDED TO RETIRE TODAY' : 'FIRE NUMBER'}</div>
      <div className="mode-number">{money(scenario.fireNumber)}</div>
      <div className="mode-fire-date">
        <span>{formatFireAge(inputs.currentAge, projection.fireMonth)}{projection.fireMonth !== null ? ' yrs' : ''}</span>
        <span className="date-divider">·</span>
        <span>{formatDate(projection.fireMonth, inputs.endAge)}</span>
      </div>
      <div className="mode-separator" />
      <div className="mode-row">
        <span>{scenario.mode === 'dividends' ? 'Net income at FIRE' : scenario.mode === 'drawdown' ? 'Terminal floor' : 'Withdrawal / year'}</span>
        <b>{scenario.mode === 'dividends'
          ? projection.annualDividendIncomeAtFire === null ? '—' : money(projection.annualDividendIncomeAtFire)
          : scenario.mode === 'drawdown' ? money(inputs.minimumTerminalBalance) : money(scenario.annualSpend)}</b>
      </div>
      <div className="mode-row">
        <span>{scenario.mode === 'dividends' ? 'Gross dividend yield' : 'End-age wealth'}</span>
        <b>{scenario.mode === 'dividends' ? `${portfolioRates.distributionYieldPercent.toFixed(1)}%` : money(projection.endBalance)}</b>
      </div>
      {scenario.mode === 'dividends' && projection.annualGrossDividendIncomeAtFire !== null && (
        <div className="mode-row"><span>Gross income at FIRE</span><b>{money(projection.annualGrossDividendIncomeAtFire)}</b></div>
      )}
      <div className="mode-row">
        <span>No-withdrawal value at {inputs.endAge}</span>
        <b>{money(projection.noWithdrawalEndBalance)}</b>
      </div>
      <div className={`mode-outcome ${outcomeClass}`}>
        <span>{outcome}</span>
      </div>
      {scenario.mode === 'dividends' && projection.firstIncomeShortfallMonth !== null && (
        <div className="mode-footnote">First income gap at age {(inputs.currentAge + projection.firstIncomeShortfallMonth / 12).toFixed(1)}; net distributions after modeled tax plus other income are compared with spending. Principal sales are excluded.</div>
      )}
    </article>
  )
}

export default function App() {
  const [inputs, setInputs] = useState<PlanInputs>(loadSavedPlan)
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>('EUR')
  const [selectedSpend, setSelectedSpend] = useState(1_500)
  const [selectedModes, setSelectedModes] = useState<RetirementMode[]>(RETIREMENT_MODES)
  const [travelPreview, setTravelPreview] = useState(5_000)
  const [fxStatus, setFxStatus] = useState('')
  const [monteCarloResults, setMonteCarloResults] = useState<Partial<Record<RetirementMode, MonteCarloSummary>>>({})
  const [monteCarloPending, setMonteCarloPending] = useState(true)
  const [monteCarloError, setMonteCarloError] = useState('')
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs))
    } catch {
      // The planner remains usable if browser storage is unavailable or full.
    }
  }, [inputs])

  useEffect(() => {
    setMonteCarloResults({})
    setMonteCarloPending(true)
    setMonteCarloError('')
    const worker = new Worker(new URL('./monteCarlo.worker.ts', import.meta.url), { type: 'module' })
    const debounce = window.setTimeout(() => {
      worker.onmessage = (event: MessageEvent<Partial<Record<RetirementMode, MonteCarloSummary>>>) => {
        setMonteCarloResults(event.data)
        setMonteCarloPending(false)
      }
      worker.onerror = (event) => {
        setMonteCarloError(event.message || 'Could not calculate the sequence-risk paths.')
        setMonteCarloPending(false)
      }
      worker.postMessage({ inputs, monthlySpend: selectedSpend })
    }, 150)

    return () => {
      window.clearTimeout(debounce)
      worker.terminate()
    }
  }, [inputs, selectedSpend])

  const updateNumber = (key: NumericKey, value: number) => {
    setInputs((previous) => ({ ...previous, [key]: value }))
  }
  const convert = (amountEur: number) => displayCurrency === 'EUR' ? amountEur : amountEur * inputs.eurToRon
  const money = (amountEur: number, compact = false) => formatMoney(convert(amountEur), displayCurrency, compact)

  const projectionScenarios = useMemo(() => {
    return RETIREMENT_MODES.map((mode) => {
      const annualSpend = selectedSpend * 12
      const fireNumber = fireTargetAtAge(inputs, selectedSpend, mode, inputs.currentAge)
      return {
        mode,
        monthlySpend: selectedSpend,
        annualSpend,
        fireNumber,
        projection: projectRetirement(inputs, selectedSpend, mode, 0, true),
      }
    })
  }, [inputs, selectedSpend])
  const scenarios = useMemo(() => projectionScenarios.map((scenario) => ({
    ...scenario,
    monteCarlo: monteCarloResults[scenario.mode],
  })), [projectionScenarios, monteCarloResults])
  const portfolioMixComparison = useMemo(() => {
    if (inputs.portfolioSetupMode !== 'power') return []

    const keepCurrentMixInputs = {
      ...inputs,
      equityAllocationPercent: inputs.currentEquityAllocationPercent,
    }
    return RETIREMENT_MODES.map((mode) => {
      const currentMix = projectRetirement(keepCurrentMixInputs, selectedSpend, mode)
      const targetMix = projectionScenarios.find((scenario) => scenario.mode === mode)!.projection
      const fundedPercent = (projection: typeof currentMix) => projection.fireMonth !== null
        && projection.depletionMonth === null
        && projection.endBalance + 1 >= inputs.minimumTerminalBalance
        && (mode !== 'dividends' || projection.incomeShortfallTotal < 0.01)
        ? 100
        : 0
      return {
        mode,
        rows: comparePortfolioOutcomes([
          {
            scenarioId: 'current-mix',
            scenarioLabel: 'Keep current mix',
            fireMonth: currentMix.fireMonth,
            endBalance: currentMix.endBalance,
            fundedThroughHorizonPercent: fundedPercent(currentMix),
          },
          {
            scenarioId: 'target-mix',
            scenarioLabel: 'Use target mix',
            fireMonth: targetMix.fireMonth,
            endBalance: targetMix.endBalance,
            fundedThroughHorizonPercent: fundedPercent(targetMix),
          },
        ], 'current-mix'),
      }
    })
  }, [inputs, projectionScenarios, selectedSpend])
  const selectedScenarios = scenarios.filter((scenario) => selectedModes.includes(scenario.mode))
  const travelAllowances = useMemo(() => projectionScenarios.map((scenario) => ({
    mode: scenario.mode,
    allowance: calculateTravelAllowance(inputs, selectedSpend, scenario.mode, inputs.travelDelayLimitMonths),
    baselineMonth: scenario.projection.fireMonth,
  })), [inputs, projectionScenarios, selectedSpend])
  const travelPreviews = useMemo(() => projectionScenarios.map((scenario) => ({
    mode: scenario.mode,
    projection: projectRetirement(inputs, selectedSpend, scenario.mode, travelPreview),
  })), [inputs, projectionScenarios, selectedSpend, travelPreview])

  const currentPortfolio = currentPortfolioEur(inputs)
  const currentGain = currentUnrealizedGainEur(inputs)
  const investableProfit = annualInvestableProfit(inputs)
  const portfolioRates = portfolioAssumptions(inputs)
  const estimateRealReturn = (((1 + (portfolioRates.nominalReturnPercent - portfolioRates.annualFeePercent) / 100) / (1 + inputs.inflationPercent / 100) - 1) * 100).toFixed(1)
  const propertyEquity = inputs.propertyValue - inputs.propertyMortgageBalance
  const netRent = propertyNetRentMonthly(inputs)

  function updateReturnOverride(mode: RetirementMode, value: number | null) {
    setInputs((previous) => ({
      ...previous,
      returnOverrides: { ...previous.returnOverrides, [mode]: value },
    }))
  }

  function addIncomeStream() {
    const stream: IncomeStream = {
      id: globalThis.crypto?.randomUUID?.() ?? `income-${Date.now()}`,
      name: 'Income stream',
      monthlyAmount: 0,
      startAge: inputs.currentAge,
      endAge: null,
    }
    setInputs((previous) => ({ ...previous, incomeStreams: [...previous.incomeStreams, stream] }))
  }

  function updateIncomeStream(id: string, patch: Partial<IncomeStream>) {
    setInputs((previous) => ({
      ...previous,
      incomeStreams: previous.incomeStreams.map((stream) => stream.id === id ? { ...stream, ...patch } : stream),
    }))
  }

  async function refreshEurRon() {
    setFxStatus('Loading ECB reference rate…')
    try {
      const response = await fetch('https://data-api.ecb.europa.eu/service/data/EXR/D.RON.EUR.SP00.A?lastNObservations=1')
      if (!response.ok) throw new Error(`ECB returned ${response.status}`)
      const xml = new DOMParser().parseFromString(await response.text(), 'application/xml')
      const observation = xml.getElementsByTagNameNS('*', 'Obs')[0]
      const date = observation?.getElementsByTagNameNS('*', 'ObsDimension')[0]?.getAttribute('value')
      const rate = Number(observation?.getElementsByTagNameNS('*', 'ObsValue')[0]?.getAttribute('value'))
      if (!date || !Number.isFinite(rate) || rate <= 0) throw new Error('ECB response did not contain a valid observation')
      setInputs((previous) => ({ ...previous, eurToRon: rate, eurToRonObservationDate: date }))
      setFxStatus(`ECB reference rate dated ${date}.`)
    } catch (error) {
      setFxStatus(error instanceof Error ? `Refresh failed: ${error.message}` : 'Refresh failed.')
    }
  }

  function toggleMode(mode: RetirementMode) {
    setSelectedModes((previous) => previous.includes(mode)
      ? previous.filter((item) => item !== mode)
      : [...previous, mode])
  }

  function exportPlan() {
    const blob = new Blob([JSON.stringify(inputs, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'northstar-fire-plan.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function importPlan(file?: File) {
    if (!file) return
    try {
      const imported = JSON.parse(await file.text()) as Partial<PlanInputs>
      setInputs({ ...DEFAULT_INPUTS, ...imported })
    } catch {
      window.alert('That file could not be read as a Northstar plan JSON file.')
    }
    if (importRef.current) importRef.current.value = ''
  }

  function resetPlan() {
    if (window.confirm('Reset all assumptions to the original sample values?')) {
      setInputs(DEFAULT_INPUTS)
      setDisplayCurrency('EUR')
      setSelectedSpend(1_500)
      setSelectedModes(RETIREMENT_MODES)
      setTravelPreview(5_000)
      setFxStatus('')
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Northstar home">
          <span className="brand-mark">N</span>
          <span>northstar<span className="brand-dot">.</span></span>
        </a>
        <div className="top-actions">
          <span className="privacy-badge"><i /> Saved on this device</span>
          <div className="currency-switch" aria-label="Display currency">
            <button className={displayCurrency === 'EUR' ? 'active' : ''} onClick={() => setDisplayCurrency('EUR')}>EUR</button>
            <button className={displayCurrency === 'RON' ? 'active' : ''} onClick={() => setDisplayCurrency('RON')}>RON</button>
          </div>
          <button className="button button-quiet" onClick={exportPlan}>Export</button>
          <button className="button button-quiet import-button" onClick={() => importRef.current?.click()}>Import</button>
          <input ref={importRef} className="visually-hidden" name="plan-import" type="file" accept="application/json,.json" onChange={(event) => void importPlan(event.currentTarget.files?.[0])} />
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-line" /> YOUR FINANCIAL INDEPENDENCE PLAN</div>
            <h1>Make room for<br /><em>the good years.</em></h1>
            <p>A living view of your path to financial independence—and what your portfolio may do after you get there.</p>
          </div>
          <div className="hero-note">
            <span className="note-kicker">THE PLAN, AT A GLANCE</span>
            <div className="note-age">{inputs.currentAge}<span> → </span>{inputs.idealFireAge}</div>
            <div className="note-caption">today <span /> ideal FIRE age</div>
            <div className="note-rule" />
            <div className="note-footer"><span className="status-dot" /> Assumptions update live</div>
          </div>
        </section>

        <section className="setup-section" aria-labelledby="setup-heading">
          <div className="setup-heading">
            <div>
              <span className="section-index">CHOOSE YOUR SETUP</span>
              <h2 id="setup-heading">How detailed should the portfolio model be?</h2>
            </div>
            <div className="setup-switch" role="group" aria-label="Portfolio setup detail">
              <button
                type="button"
                aria-pressed={inputs.portfolioSetupMode === 'simple'}
                className={inputs.portfolioSetupMode === 'simple' ? 'active' : ''}
                onClick={() => setInputs((previous) => ({ ...previous, portfolioSetupMode: 'simple' }))}
              >Simple</button>
              <button
                type="button"
                aria-pressed={inputs.portfolioSetupMode === 'power'}
                className={inputs.portfolioSetupMode === 'power' ? 'active' : ''}
                onClick={() => setInputs((previous) => ({ ...previous, portfolioSetupMode: 'power' }))}
              >Power user</button>
            </div>
          </div>
          {inputs.portfolioSetupMode === 'simple' ? (
            <div className="setup-content">
              <p className="setup-description">Use one editable expected return and volatility for the whole portfolio. This is the current planner setup.</p>
              <div className="setup-fields">
                <InputField
                  name="nominal-return"
                  label="Expected nominal total return"
                  value={inputs.nominalReturnPercent}
                  onChange={(value) => updateNumber('nominalReturnPercent', value)}
                  step="0.1"
                  suffix="% / yr"
                  info="A single editable planning assumption for the whole portfolio. Dividends and price changes are both included."
                />
                <InputField
                  name="return-volatility"
                  label="Annual return volatility"
                  value={inputs.returnVolatilityPercent}
                  onChange={(value) => updateNumber('returnVolatilityPercent', value)}
                  step="0.5"
                  suffix="% / yr"
                  info="Used by the illustrative Monte Carlo sequence-risk view."
                />
              </div>
            </div>
          ) : (
            <div className="setup-content">
              <p className="setup-description">Set an equity/bond mix and editable assumptions for each sleeve. The weighted return and volatility feed the FIRE projections and sequence-risk view. These are user assumptions, not forecasts or product recommendations.</p>
              <div className="allocation-control">
                <label htmlFor="equity-allocation">Target mix for contributions</label>
                <input
                  id="equity-allocation"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={inputs.equityAllocationPercent}
                  onChange={(event) => updateNumber('equityAllocationPercent', Number(event.currentTarget.value))}
                  aria-valuetext={`${inputs.equityAllocationPercent}% equities, ${100 - inputs.equityAllocationPercent}% bonds`}
                />
                <div className="allocation-labels"><span>Diversified equities <b>{inputs.equityAllocationPercent}%</b></span><span>EUR government bonds <b>{100 - inputs.equityAllocationPercent}%</b></span></div>
              </div>
              <div className="allocation-control">
                <label htmlFor="current-equity-allocation">Current holdings mix</label>
                <input
                  id="current-equity-allocation"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={inputs.currentEquityAllocationPercent}
                  onChange={(event) => updateNumber('currentEquityAllocationPercent', Number(event.currentTarget.value))}
                  aria-valuetext={`${inputs.currentEquityAllocationPercent}% equities, ${100 - inputs.currentEquityAllocationPercent}% bonds`}
                />
                <div className="allocation-labels"><span>Diversified equities <b>{inputs.currentEquityAllocationPercent}%</b></span><span>EUR government bonds <b>{100 - inputs.currentEquityAllocationPercent}%</b></span></div>
              </div>
              <div className="setup-fields power-fields">
                <InputField name="equity-return" label="Equity nominal return" value={inputs.equityNominalReturnPercent} onChange={(value) => updateNumber('equityNominalReturnPercent', value)} step="0.1" suffix="% / yr" />
                <InputField name="equity-volatility" label="Equity volatility" value={inputs.equityVolatilityPercent} onChange={(value) => updateNumber('equityVolatilityPercent', value)} step="0.5" suffix="% / yr" />
                <InputField name="equity-fee" label="Equity annual fee" value={inputs.equityAnnualFeePercent} onChange={(value) => updateNumber('equityAnnualFeePercent', value)} step="0.05" suffix="% / yr" />
                <InputField name="equity-yield" label="Equity cash distribution yield" value={inputs.equityDistributionYieldPercent} onChange={(value) => updateNumber('equityDistributionYieldPercent', value)} step="0.1" suffix="% / yr" />
                <InputField name="bond-return" label="Bond nominal return" value={inputs.bondNominalReturnPercent} onChange={(value) => updateNumber('bondNominalReturnPercent', value)} step="0.1" suffix="% / yr" />
                <InputField name="bond-volatility" label="Bond volatility" value={inputs.bondVolatilityPercent} onChange={(value) => updateNumber('bondVolatilityPercent', value)} step="0.5" suffix="% / yr" />
                <InputField name="bond-fee" label="Bond annual fee" value={inputs.bondAnnualFeePercent} onChange={(value) => updateNumber('bondAnnualFeePercent', value)} step="0.05" suffix="% / yr" />
                <InputField name="bond-yield" label="Bond cash distribution yield" value={inputs.bondDistributionYieldPercent} onChange={(value) => updateNumber('bondDistributionYieldPercent', value)} step="0.1" suffix="% / yr" />
                <InputField name="equity-bond-correlation" label="Equity/bond correlation" value={inputs.equityBondCorrelation} onChange={(value) => updateNumber('equityBondCorrelation', Math.max(-1, Math.min(1, value)))} min={-1} max={1} step="0.1" />
                <div className="input-field">
                  <label className="input-label" htmlFor="rebalance-schedule">Rebalancing</label>
                  <select id="rebalance-schedule" value={inputs.rebalanceSchedule} onChange={(event) => setInputs((previous) => ({ ...previous, rebalanceSchedule: event.currentTarget.value as PlanInputs['rebalanceSchedule'] }))}>
                    <option value="never">Never</option>
                    <option value="annually">Annually</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div className="derived-assumptions" aria-live="polite">
                  <span>Weighted gross return <b>{portfolioRates.nominalReturnPercent.toFixed(2)}%</b></span>
                  <span>Weighted fees / net return <b>{portfolioRates.annualFeePercent.toFixed(2)}% / {portfolioRates.netNominalReturnPercent.toFixed(2)}%</b></span>
                  <span>Weighted cash yield <b>{portfolioRates.distributionYieldPercent.toFixed(2)}%</b></span>
                  <span>Weighted volatility <b>{portfolioRates.volatilityPercent.toFixed(2)}%</b></span>
                </div>
              </div>
              <p className="field-hint">Existing holdings start at the current mix. New contributions use the target mix; rebalancing follows the selected schedule. The 100% equity defaults preserve the current starting assumption. Bond assumptions are editable placeholders, not forecasts or product availability claims.</p>
            </div>
          )}
        </section>

        <section className="metric-grid" aria-label="Plan overview">
          <article className="metric-card metric-primary">
            <div className="metric-label">INVESTED TODAY <InfoTip label="Current portfolio value">EUR market value plus USD market value converted to EUR. Unrealized gains are already included in market value.</InfoTip></div>
            <strong>{money(currentPortfolio)}</strong>
            <div className="metric-foot">{money(currentGain)} unrealized gain included</div>
          </article>
          <article className="metric-card">
            <div className="metric-label">AVAILABLE TO INVEST / YEAR <InfoTip label="Net business contribution">Annual profit less the business reserve percentage. Contributions stop when a selected FIRE path begins.</InfoTip></div>
            <strong>{money(investableProfit)}</strong>
            <div className="metric-foot">After {inputs.businessReservePercent}% business reinvestment</div>
          </article>
          <article className="metric-card">
            <div className="metric-label">SELECTED RETIREMENT SPEND <InfoTip label="Spending scenario">The selected amount is treated as a real annual expense in today's money after FIRE.</InfoTip></div>
            <strong>{money(selectedSpend)}<small> / mo</small></strong>
            <div className="metric-foot">{money(selectedSpend * 12)} per year in today's money</div>
          </article>
          <article className="metric-card metric-goal">
            <div className="metric-label">RETIREMENT HORIZON <InfoTip label="End age">Post-FIRE paths are simulated through this age. Default 90 is configurable; the planned-drawdown target depends on it.</InfoTip></div>
            <strong>{inputs.endAge}<small> yrs</small></strong>
            <div className="metric-foot">{Math.max(0, inputs.endAge - inputs.currentAge)} years from today</div>
          </article>
        </section>

        <div className="workspace-grid">
          <aside className="assumptions-panel">
            <div className="section-heading compact-heading">
              <div><span className="section-index">01 / INPUTS</span><h2>Your assumptions</h2></div>
              <button className="text-button" onClick={resetPlan}>Reset</button>
            </div>

            <section className="input-section">
              <div className="input-section-title"><span className="section-icon">◈</span><h3>Starting point</h3></div>
              <div className="field-grid">
                <InputField name="current-age" label="Current age" value={inputs.currentAge} onChange={(value) => updateNumber('currentAge', value)} step="0.1" suffix="yrs" />
                <InputField name="ideal-fire-age" label="Ideal FIRE age" value={inputs.idealFireAge} onChange={(value) => updateNumber('idealFireAge', value)} step="0.1" suffix="yrs" />
              </div>
              <div className="field-grid">
                <InputField name="end-age" label="Plan through age" value={inputs.endAge} onChange={(value) => updateNumber('endAge', value)} step="1" suffix="yrs" info="The drawdown target discounts spending only through this age. SWR and dividend-only paths are also checked through this age." />
                <InputField name="minimum-terminal-balance" label="Minimum left at end" value={inputs.minimumTerminalBalance} onChange={(value) => updateNumber('minimumTerminalBalance', value)} step="1000" suffix="EUR" info="Terminal floor for planned drawdown. Zero means no planned inheritance reserve; edit to model one." />
              </div>
              <InputField name="eur-portfolio" label="EUR investments · market value" value={inputs.eurPortfolio} onChange={(value) => updateNumber('eurPortfolio', value)} step="0.01" suffix="EUR" />
              <div className="field-grid">
                <InputField name="eur-gain" label="EUR unrealized gain" value={inputs.eurUnrealizedGain} onChange={(value) => updateNumber('eurUnrealizedGain', value)} step="0.01" suffix="EUR" />
                <InputField name="usd-portfolio" label="USD investments · market value" value={inputs.usdPortfolio} onChange={(value) => updateNumber('usdPortfolio', value)} step="0.01" suffix="USD" />
              </div>
              <InputField name="usd-gain" label="USD unrealized gain" value={inputs.usdUnrealizedGain} onChange={(value) => updateNumber('usdUnrealizedGain', value)} step="0.01" suffix="USD" />
              <p className="inline-note">Current mix modeled as 100% stocks. Unrealized gains are informational; market value is the projection starting point.</p>
            </section>

            <section className="input-section">
              <div className="input-section-title"><span className="section-icon">↗</span><h3>Profit & deposits</h3></div>
              <div className="field-grid">
                <InputField name="annual-profit" label="Annual business profit" value={inputs.annualProfit} onChange={(value) => updateNumber('annualProfit', value)} suffix="EUR" />
                <InputField name="business-reserve" label="Business reinvestment" value={inputs.businessReservePercent} onChange={(value) => updateNumber('businessReservePercent', Math.min(100, value))} step="0.1" suffix="%" hint="Your current estimate: 1–2%." />
              </div>
              <div className="input-field">
                <label className="input-label" htmlFor="deposit-frequency">How profit arrives</label>
                <select id="deposit-frequency" name="deposit-frequency" value={inputs.depositFrequency} onChange={(event) => setInputs((previous) => ({ ...previous, depositFrequency: event.currentTarget.value as PlanInputs['depositFrequency'] }))}>
                  <option value="monthly">Monthly · evenly through year</option>
                  <option value="quarterly">Quarterly · evenly through year</option>
                  <option value="yearly">Once a year</option>
                  <option value="irregular">Irregular · enter each quarter</option>
                </select>
              </div>
              {inputs.depositFrequency === 'irregular' && (
                <div className="quarter-grid">
                  {inputs.irregularQuarterlyGross.map((amount, index) => (
                    <InputField
                      key={index}
                      name={`quarter-${index + 1}`}
                      label={`Q${index + 1} gross`}
                      value={amount}
                      onChange={(value) => setInputs((previous) => {
                        const schedule = [...previous.irregularQuarterlyGross] as PlanInputs['irregularQuarterlyGross']
                        schedule[index] = value
                        return { ...previous, irregularQuarterlyGross: schedule }
                      })}
                      suffix="EUR"
                    />
                  ))}
                </div>
              )}
              <p className="inline-note">Invested as soon as it arrives. The reserve is deducted first.</p>
            </section>

            <section className="input-section">
              <div className="input-section-title"><span className="section-icon">⌂</span><h3>Property cash flow</h3></div>
              <div className="field-grid">
                <InputField name="property-value" label="Property market value" value={inputs.propertyValue} onChange={(value) => updateNumber('propertyValue', value)} suffix="EUR" />
                <InputField name="property-mortgage-balance" label="Mortgage balance" value={inputs.propertyMortgageBalance} onChange={(value) => updateNumber('propertyMortgageBalance', value)} suffix="EUR" />
              </div>
              <div className="field-grid">
                <InputField name="property-gross-rent" label="Gross rent" value={inputs.propertyGrossRentMonthly} onChange={(value) => updateNumber('propertyGrossRentMonthly', value)} suffix="EUR / mo" />
                <InputField name="property-expenses" label="Operating costs" value={inputs.propertyExpensesMonthly} onChange={(value) => updateNumber('propertyExpensesMonthly', value)} suffix="EUR / mo" />
              </div>
              <InputField name="property-mortgage-payment" label="Mortgage payment" value={inputs.propertyMortgagePaymentMonthly} onChange={(value) => updateNumber('propertyMortgagePaymentMonthly', value)} suffix="EUR / mo" />
              <div className="property-summary">
                <span>Current equity (excluded from liquid FIRE target) <b>{money(propertyEquity)}</b></span>
                <span>Net rent after entered costs/debt payment <b>{money(netRent)} / mo</b></span>
              </div>
              <p className="inline-note">Net rent is invested before FIRE and offsets spending after FIRE. Property value/equity is shown separately, not counted as liquid investments. Tax and future mortgage amortization are not modeled.</p>
            </section>

            <section className="input-section">
              <div className="input-section-title"><span className="section-icon">↘</span><h3>Pension & later income</h3></div>
              {inputs.incomeStreams.map((stream) => (
                <div className="income-stream" key={stream.id}>
                  <div className="income-stream-heading">
                    <input
                      className="text-input"
                      aria-label="Income stream name"
                      value={stream.name}
                      onChange={(event) => updateIncomeStream(stream.id, { name: event.currentTarget.value })}
                    />
                    <button type="button" className="text-button" onClick={() => setInputs((previous) => ({
                      ...previous,
                      incomeStreams: previous.incomeStreams.filter((item) => item.id !== stream.id),
                    }))}>Remove</button>
                  </div>
                  <InputField name={`income-${stream.id}-amount`} label="Monthly amount in today's money" value={stream.monthlyAmount} onChange={(value) => updateIncomeStream(stream.id, { monthlyAmount: value })} suffix="EUR" />
                  <div className="field-grid">
                    <InputField name={`income-${stream.id}-start`} label="Starts at age" value={stream.startAge} onChange={(value) => updateIncomeStream(stream.id, { startAge: value })} step="0.1" suffix="yrs" />
                    {stream.endAge !== null && <InputField name={`income-${stream.id}-end`} label="Ends at age" value={stream.endAge} onChange={(value) => updateIncomeStream(stream.id, { endAge: value })} step="0.1" suffix="yrs" />}
                  </div>
                  <label className="stream-toggle">
                    <input type="checkbox" checked={stream.endAge === null} onChange={(event) => updateIncomeStream(stream.id, { endAge: event.currentTarget.checked ? null : inputs.endAge })} />
                    Continues through the plan horizon
                  </label>
                </div>
              ))}
              <button type="button" className="button add-income-button" onClick={addIncomeStream}>+ Add income stream</button>
              <p className="inline-note">Real, after-tax monthly income is assumed in today's euros. Active streams offset portfolio-funded spending; excess income is saved. Enter business/pension amounts net of taxes.</p>
            </section>

            <section className="input-section last-input-section">
              <div className="input-section-title"><span className="section-icon">⌁</span><h3>Return & income assumptions</h3></div>
              <div className="field-grid">
                <InputField name="inflation" label="Inflation" value={inputs.inflationPercent} onChange={(value) => updateNumber('inflationPercent', value)} step="0.1" suffix="% / yr" info="Used with nominal total return and fees to convert projections into today's purchasing power. This is an editable planning assumption, not a forecast." />
                {inputs.portfolioSetupMode === 'simple' && <InputField name="annual-fees" label="Annual fees" value={inputs.annualFeePercent} onChange={(value) => updateNumber('annualFeePercent', value)} step="0.05" suffix="% / yr" info="Deducted from nominal total return before converting to a real return. Includes the user's estimated ongoing investment fees; capital-gains and rental taxes are not modeled." />}
                <InputField name="withdrawal-rate" label="Withdrawal rate" value={inputs.withdrawalRatePercent} onChange={(value) => updateNumber('withdrawalRatePercent', value)} step="0.1" suffix="%" info="Sets the initial target for total-return mode: annual spending ÷ rate. It does not guarantee the money lasts to age 90; the drawdown path reports the modeled result." />
              </div>
              <div className="override-list">
                <span className="input-label">Optional total-return assumption by approach</span>
                {RETIREMENT_MODES.map((mode) => (
                  <div className="return-override" key={mode}>
                    <label className="stream-toggle">
                      <input
                        type="checkbox"
                        checked={inputs.returnOverrides[mode] !== null}
                        onChange={(event) => updateReturnOverride(mode, event.currentTarget.checked ? inputs.nominalReturnPercent : null)}
                      />
                      Customize {MODE_META[mode].title}
                    </label>
                    {inputs.returnOverrides[mode] !== null && (
                      <InputField
                        name={`return-${mode}`}
                        label={`${MODE_META[mode].title} nominal return`}
                        value={inputs.returnOverrides[mode] ?? inputs.nominalReturnPercent}
                        onChange={(value) => updateReturnOverride(mode, value)}
                        step="0.1"
                        suffix="% / yr"
                      />
                    )}
                  </div>
                ))}
              </div>
              {inputs.portfolioSetupMode === 'simple' && <InputField
                name="dividend-yield"
                label="Dividend income yield"
                value={inputs.dividendYieldPercent}
                onChange={(value) => updateNumber('dividendYieldPercent', value)}
                step="0.1"
                suffix="% / yr"
                hint="Gross distribution-yield reference; not your current 100%-stock portfolio's actual yield."
                info={<>
                  Default 1.9% is a gross cash-yield planning proxy, not a guaranteed or personalized portfolio yield. It is rounded down from an illustrative 60% short-duration EUR government-bond distributing ETF / 40% dividend-aristocrat equity ETF mix (weighted cited trailing yields ≈1.97%, checked 22 Oct 2026). It is before personal tax. The 1.9% yield does not define the mix's total-return forecast. The provider country-registration lists for these examples do not include Romania; broker-level retail availability is not established. Sources: <a href="https://www.ishares.com/uk/individual/en/products/251741/ishares-euro-government-bond-ucits-etf" target="_blank" rel="noreferrer">EUR government bonds</a> and <a href="https://www.ssga.com/uk/en_gb/intermediary/etfs/funds/spdr-sp-us-dividend-aristocrats-ucits-etf-dist-spyd-gy" target="_blank" rel="noreferrer">dividend aristocrats ETF</a>.
                </>}
              />}
              <div className="field-grid">
                <InputField name="dividend-tax" label="Effective dividend tax" value={inputs.dividendTaxPercent} onChange={(value) => updateNumber('dividendTaxPercent', Math.min(100, value))} step="0.1" suffix="%" info="A simplified effective rate applied to cash distributions in dividend-only mode. It is not a Romanian tax calculator; enter your own estimated rate or leave at 0%." />
              </div>
              <InputField name="monte-carlo-runs" label="Monte Carlo paths" value={inputs.monteCarloRuns} onChange={(value) => updateNumber('monteCarloRuns', Math.max(100, Math.min(10_000, Math.round(value))))} step="100" min={100} max={10_000} hint="100–10,000 paths; results are reproducible for the same inputs." />
              <div className="field-grid">
                <InputField name="usd-eur" label="USD → EUR" value={inputs.usdToEur} onChange={(value) => updateNumber('usdToEur', value)} step="0.001" info="Converts USD holdings into the EUR calculation base. Editable, fixed for the projection, and not refreshed from a live exchange-rate source." />
                <div>
                  <InputField name="eur-ron" label="EUR → RON" value={inputs.eurToRon} onChange={(value) => {
                    setInputs((previous) => ({ ...previous, eurToRon: value, eurToRonObservationDate: null }))
                    setFxStatus('Rate edited manually; refresh to use a dated ECB observation.')
                  }} step="0.0001" info="Presentation conversion only. The model remains calculated in EUR; this rate changes the displayed RON values." />
                  <button type="button" className="button refresh-rate-button" onClick={() => void refreshEurRon()} disabled={fxStatus === 'Loading ECB reference rate…'}>
                    {fxStatus === 'Loading ECB reference rate…' ? 'Refreshing…' : 'Refresh from ECB'}
                  </button>
                  <span className="field-hint">{inputs.eurToRonObservationDate ? `ECB observation: ${inputs.eurToRonObservationDate}` : 'Current value is a manual placeholder.'}</span>
                  {fxStatus && <span className="field-hint" role="status">{fxStatus}</span>}
                </div>
              </div>
              <p className="inline-note">FX values remain editable. ECB refresh is manual, updates only the displayed EUR/RON rate, and sends no plan inputs.</p>
            </section>
          </aside>

          <div className="analysis-column">
            <section className="spend-section">
              <div className="section-heading">
                <div><span className="section-index">02 / YOUR NUMBER</span><h2>What does freedom cost?</h2></div>
                <span className="today-tag">IN TODAY'S MONEY</span>
              </div>
              <div className="scenario-grid">
                {[inputs.targetAgeOne, inputs.targetAgeTwo, inputs.targetAgeThree].map((monthlySpend, index) => {
                  const selected = selectedSpend === monthlySpend
                  const annualSpend = monthlySpend * 12
                  const swrTarget = fireTargetAtAge(inputs, monthlySpend, 'swr', inputs.currentAge)
                  const divTarget = fireTargetAtAge(inputs, monthlySpend, 'dividends', inputs.currentAge)
                  const drawdownTarget = fireTargetAtAge(inputs, monthlySpend, 'drawdown', inputs.currentAge)
                  return (
                    <button key={`${monthlySpend}-${index}`} className={`scenario-card ${['sage', 'gold', 'rose'][index]} ${selected ? 'selected' : ''}`} onClick={() => setSelectedSpend(monthlySpend)}>
                      <span className="scenario-top"><span>{index === 0 ? 'LEAN' : index === 1 ? 'COMFORTABLE' : 'ROOMY'}</span><span className="scenario-select">{selected ? 'SELECTED' : 'VIEW'}</span></span>
                      <strong>{money(monthlySpend)}<small> / month</small></strong>
                      <span className="scenario-target">Total-return target <b>{money(swrTarget)}</b></span>
                      <span className="scenario-target">Dividend target <b>{money(divTarget)}</b></span>
                      <span className="scenario-target">Drawdown target <b>{money(drawdownTarget)}</b></span>
                      <span className="scenario-foot">{money(annualSpend)} / year · {inputs.endAge} end age</span>
                    </button>
                  )
                })}
              </div>
              <div className="target-explainer">
                <InfoTip label="Why targets differ">Each target funds the selected real spending through a different rule: withdrawal-rate capital, after-modeled-tax dividend yield, or a finite-age present value. Dividend tax uses only your editable effective rate; capital-gains and rental taxes are not modeled. Select approaches below to compare their paths.</InfoTip>
                <span>Same spending need, different retirement-funding rules. Only an approximate dividend-tax rate is modeled.</span>
              </div>
            </section>

            <section className="comparison-section">
              <div className="section-heading comparison-heading">
                <div><span className="section-index">03 / COMPARE APPROACHES</span><h2>Choose what to see</h2></div>
                <InfoTip label="Comparison checklist">Select one or more retirement approaches. Each selected approach gets its own FIRE target, date, withdrawal path, end-age result, and travel allowance.</InfoTip>
              </div>
              {inputs.portfolioSetupMode === 'power' && (
                <div className="portfolio-mix-comparison">
                  <div className="mix-comparison-heading">
                    <b>Portfolio mix comparison</b>
                    <span>Keep current {inputs.currentEquityAllocationPercent}/{100 - inputs.currentEquityAllocationPercent} vs target {inputs.equityAllocationPercent}/{100 - inputs.equityAllocationPercent} · deterministic model</span>
                  </div>
                  <div className="mix-comparison-grid">
                    {portfolioMixComparison.map(({ mode, rows }) => {
                      const current = rows[0]
                      const target = rows[1]
                      const fireDelta = target.fireMonthDelta
                      const funded = (row: typeof current) => row.fundedThroughHorizonPercent > 0 ? 'Plan funded' : 'Plan not funded'
                      return (
                        <article key={mode} className="mix-comparison-card" style={{ '--mode-color': MODE_META[mode].color } as CSSProperties}>
                          <b>{MODE_META[mode].short}</b>
                          <div className="mix-outcome-pair">
                            <span>{current.scenarioLabel}<strong>{formatFireAge(inputs.currentAge, current.fireMonth)}</strong></span>
                            <span>{target.scenarioLabel}<strong>{formatFireAge(inputs.currentAge, target.fireMonth)}</strong></span>
                          </div>
                          <span>Target FIRE shift<strong>{fireDelta === null ? '—' : `${fireDelta > 0 ? '+' : ''}${fireDelta} months`}</strong></span>
                          <span>End balance change<strong>{money(target.endBalanceDelta)}</strong></span>
                          <span>Funding status<strong>{funded(current)} → {funded(target)}</strong></span>
                        </article>
                      )
                    })}
                  </div>
                  <p className="field-hint">“Keep current mix” holds contributions at the current allocation; “Use target mix” applies the selected target contribution weights. Both start with the entered current holdings mix and use the selected rebalance schedule. Funding status is deterministic, not a probability.</p>
                </div>
              )}
              <div className="mode-checklist">
                {RETIREMENT_MODES.map((mode) => (
                  <label key={mode} className={`checklist-option ${selectedModes.includes(mode) ? 'checked' : ''}`}>
                    <input name={`retirement-mode-${mode}`} type="checkbox" checked={selectedModes.includes(mode)} onChange={() => toggleMode(mode)} />
                    <span className="checkmark" />
                    <i style={{ backgroundColor: MODE_META[mode].color }} />
                    <span>{MODE_META[mode].title}</span>
                  </label>
                ))}
              </div>
              <div className="mode-grid">
                {selectedScenarios.map((scenario) => (
                  <ModeCard key={scenario.mode} scenario={scenario} inputs={inputs} currency={displayCurrency} />
                ))}
              </div>
              <div className="risk-analysis">
                <div className="risk-heading">
                  <b>Sequence-risk view · Monte Carlo</b>
                  <InfoTip label="Illustrative return sequences">Simple setup samples monthly lognormal returns from the portfolio assumptions. Power user samples correlated equity and bond sleeve returns and applies the selected rebalancing rule. Success means FIRE is reached, no portfolio depletion occurs, the terminal floor is met, and dividend-only spending has no income gap. This is a model scenario, not a forecast.</InfoTip>
                </div>
                <div className="risk-grid">
                  {monteCarloPending && <p className="inline-note" role="status">Updating sequence-risk paths in the background…</p>}
                  {monteCarloError && <p className="inline-note" role="status">{monteCarloError}</p>}
                  {!monteCarloPending && !monteCarloError && selectedScenarios.map((scenario) => {
                    const result = scenario.monteCarlo
                    if (!result) return null
                    const moneyValue = (value: number) => money(value)
                    return (
                      <article className="risk-card" key={scenario.mode} style={{ '--mode-color': MODE_META[scenario.mode].color } as CSSProperties}>
                        <b>{MODE_META[scenario.mode].short}</b>
                        <span>Funded through age {inputs.endAge}<strong>{result.successPercent.toFixed(1)}%</strong></span>
                        <span>Reached FIRE by end age<strong>{result.fireReachPercent.toFixed(1)}%</strong></span>
                        <span>Median FIRE age<strong>{result.fireAgeMedian === null ? '—' : result.fireAgeMedian.toFixed(1)}</strong></span>
                        <span>End-age portfolio · P10 / median / P90<strong>{moneyValue(result.endBalanceP10)} / {moneyValue(result.endBalanceMedian)} / {moneyValue(result.endBalanceP90)}</strong></span>
                        <small>{result.runs.toLocaleString()} paths · 10th–90th percentile FIRE age {result.fireAgeP10 === null || result.fireAgeP90 === null ? '—' : `${result.fireAgeP10.toFixed(1)}–${result.fireAgeP90.toFixed(1)}`}</small>
                      </article>
                    )
                  })}
                  {selectedScenarios.length === 0 && <p className="inline-note">Select an approach to show its sequence-risk outcomes.</p>}
                </div>
              </div>
            </section>

            <section className="chart-section">
              <div className="section-heading chart-heading">
                <div><span className="section-index">04 / THE TRAJECTORY</span><h2>Accumulation → retirement</h2></div>
                <span className="chart-subtitle">REAL VALUE · {displayCurrency} DISPLAY</span>
              </div>
              <div className="chart-description">
                Solid lines count post-FIRE spending. Dotted lines show the same portfolio growth without withdrawals; both lines match until each FIRE date.
              </div>
              <ProjectionChart scenarios={selectedScenarios} inputs={inputs} currency={displayCurrency} />
              <div className="chart-caption">
                <span>Contributions stop at each FIRE marker</span>
                <span>{estimateRealReturn}% real return for shared assumption · through age {inputs.endAge}</span>
              </div>
              <p className="chart-disclaimer">After FIRE, pre-FIRE travel outflows stop and the selected retirement rule begins. Dotted paths are counterfactuals, not forecasts.</p>
            </section>

            <section className="travel-section">
              <div className="travel-heading">
                <div>
                  <span className="section-index">05 / THE GUILT-FREE VIEW</span>
                  <h2>Go make the memories.</h2>
                  <p>Each selected approach gets the largest annual travel budget that stays within the configured FIRE delay.</p>
                </div>
                <div className="travel-stamp"><span>DELAY CAP</span><b>{inputs.travelDelayLimitMonths}<small> months</small></b></div>
              </div>
              <div className="travel-controls">
                <InputField name="travel-delay-limit" label="Maximum FIRE delay" value={inputs.travelDelayLimitMonths} onChange={(value) => updateNumber('travelDelayLimitMonths', value)} step="1" suffix="months" info="The travel solver compares each approach with the same assumptions and no extra travel outflow, then searches for the highest annual travel spend within this delay." />
                <InputField name="travel-preview" label="Preview annual travel spend" value={travelPreview} onChange={setTravelPreview} step="100" suffix="EUR / yr" />
                <InputField name="post-fire-travel" label="Post-FIRE travel spending" value={inputs.postFireTravelAnnual} onChange={(value) => updateNumber('postFireTravelAnnual', value)} step="100" suffix="EUR / yr" info="A separate recurring real annual travel amount added to retirement spending. The pre-FIRE travel allowance remains solved from the chosen FIRE-delay cap." />
              </div>
              <div className="travel-results">
                {selectedScenarios.map((scenario) => {
                  const item = travelAllowances.find((result) => result.mode === scenario.mode)!
                  const preview = travelPreviews.find((result) => result.mode === scenario.mode)!.projection
                  const previewDelay = item.baselineMonth === null
                    ? null
                    : preview.fireMonth === null
                      ? Number.POSITIVE_INFINITY
                      : Math.max(0, preview.fireMonth - item.baselineMonth)
                  const delayText = previewDelay === null
                    ? 'Baseline not reached by end age'
                    : !Number.isFinite(previewDelay)
                      ? `Not reached by age ${inputs.endAge}`
                      : previewDelay === 0 ? 'No full-month shift' : `+${previewDelay} months`
                  return (
                    <article key={scenario.mode} className="travel-mode-result" style={{ '--mode-color': MODE_META[scenario.mode].color } as CSSProperties}>
                      <div className="travel-mode-title"><i />{MODE_META[scenario.mode].short}</div>
                      <span className="result-label">GUILT-FREE TRAVEL / YEAR</span>
                      <strong>{item.allowance.annualBudget === null ? '—' : money(item.allowance.annualBudget)}</strong>
                      <span className="result-detail">{item.allowance.annualBudget === null ? 'No baseline FIRE date within horizon' : `${money(item.allowance.annualBudget / 12)} per month equivalent`}</span>
                      {item.allowance.capped && <span className="result-detail">Above the €200k search ceiling.</span>}
                      <div className="travel-preview-impact">
                        <span>Preview shift at {money(travelPreview)} / year</span>
                        <b className={previewDelay !== null && previewDelay > inputs.travelDelayLimitMonths ? 'over-limit' : ''}>{delayText}</b>
                      </div>
                    </article>
                  )
                })}
                {selectedScenarios.length === 0 && <div className="empty-travel">Select an approach to calculate its travel allowance.</div>}
              </div>
              <div className="travel-footnote">The solved allowance models pre-FIRE travel and its effect on the FIRE date. Post-FIRE travel is entered separately and is included in each retirement target, projection, and sequence-risk outcome. Both amounts are real annual spending in today's euros.</div>
            </section>
            <p className="model-note">Planning model, not a promise about future returns. Monte Carlo paths are illustrative and depend on the selected setup's return, fee, volatility, and correlation assumptions; they do not predict future outcomes.</p>
          </div>
        </div>
      </main>

      <footer className="footer"><span>northstar<span className="brand-dot">.</span> · Private by design</span><span>Inputs stay in this browser; no account or backend.</span></footer>
    </div>
  )
}
