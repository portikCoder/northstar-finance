# Product plan

## Goal

Provide a personal FIRE planner that makes the assumptions visible, compares multiple definitions of retirement funding, and estimates how much can be spent on travel before FIRE without delaying the selected path by more than the user's chosen threshold.

## Generic starting examples

The app's starting values are generic demonstration inputs, not a description of any user's finances or profile. They can be edited in the UI; the current plan is stored locally in that browser and can be exported as JSON.

The model uses EUR for calculations and can display converted RON values. It supports configurable spending scenarios, contribution schedules, an ideal FIRE age, a travel-delay limit, an end age, and a minimum terminal balance. The projected FIRE age and date are calculated from the inputs rather than forced to match the ideal age.

## Three selectable retirement approaches

The comparison checklist controls which approaches appear in the result cards and trajectory chart. All three are selected by default. Each approach computes its own target, FIRE date, post-FIRE path, end-age result, and travel allowance.

1. **Total-return / withdrawal-rate** — use the editable withdrawal-rate assumption to set the initial target. Retirement spending is funded from total portfolio return, including dividends and asset sales as needed. Show depletion age and the value at the selected end age. This is a deterministic scenario check, not a historical or probabilistic safety guarantee.
2. **Dividend income only** — target a portfolio whose estimated after-modeled-tax cash distributions cover annual portfolio-funded spending. Do not sell principal. Show net income, any annual spending shortfall, and ending principal. The yield is an editable gross-yield planning assumption; tax uses only the user's effective-rate input.
3. **Planned drawdown** — calculate the capital needed to fund real spending until the chosen end age and leave the chosen minimum balance. Show whether the path funds the plan and its terminal balance.

The three approaches are alternatives, not three ingredients to combine into one FIRE number. Their targets can differ materially.

## Portfolio setup modes

A setup selector near the start of the page controls how the portfolio return and risk assumptions are supplied:

- **Simple** uses one editable nominal total-return assumption and one volatility assumption for the whole portfolio. It preserves the existing lightweight planning view.
- **Power user** models a two-sleeve mix of diversified equities and EUR government bonds. The user sets the current holdings mix, target contribution mix, rebalancing schedule, each sleeve's nominal return, volatility, annual fee, and cash distribution yield, plus the sleeve correlation. The bond weight is the remainder, so each mix totals 100%.
- Existing holdings start at the current mix; new contributions use the target mix. Negative cash flows reduce sleeves pro rata. Monthly or annual rebalancing can move balances to target weights, or rebalancing can be disabled. The derived weighted gross return, fee, net return, cash yield, and covariance-based volatility feed the FIRE projections and sequence-risk simulation. Dividend-only targets use the target mix's weighted yield; retirement cash income uses the current sleeve balances and their yields.
- A deterministic comparison shows the FIRE age, end balance, and funding status for continuing the current mix versus applying the target mix. Both start with the same current holdings allocation and selected rebalancing schedule. This funding status is not a probability.
- The power-user default is 100% equities, preserving the original starting calculation. Bond return, volatility, fee, yield, and correlation defaults are editable illustrative placeholders, not sourced forecasts. No named funds, provider eligibility, Romanian registration, or broker execution access is implied.
- Per-retirement-approach return overrides continue to take precedence over the shared/weighted nominal return. The portfolio volatility remains shared across approaches.

The power-user view is a simplified two-sleeve model, not a holdings-level simulator. Monte Carlo samples correlated sleeve-level return paths, but does not model changing correlations, intra-month trading, currency hedging, or product-specific taxes.

## Additional income, property, and tax inputs

- An optional effective dividend-tax percentage reduces spendable distributions and raises the dividend-only target. It is a generic user-entered approximation, not Romanian tax advice; capital-gains tax and rental tax are not modeled.
- Each approach may use an optional nominal-return override. An unset override uses the shared nominal-return assumption. These are scenario inputs and do not represent asset-allocation recommendations.
- Users may add real monthly pension or continuing-business income streams with a start age and optional end age. Active income reduces portfolio-funded expenses; surplus is assumed saved. Amounts are entered net of taxes in today's euros.
- Property value and mortgage balance are shown as a separate current equity snapshot, excluded from liquid FIRE targets. Net rent (gross rent less entered operating costs and mortgage payment) is invested before FIRE and offsets spending after FIRE. Appreciation, mortgage amortization, a property sale, and rental taxes are not modeled.
- The optional Monte Carlo view samples monthly return paths from each approach's average-return input. Simple setup uses one portfolio-wide volatility assumption; Power user samples correlated sleeve-level returns and applies the selected rebalancing schedule. It reports FIRE reach, modeled funding success, and terminal-balance percentiles. Results are reproducible for the same inputs, calculated in a background worker, and are not forecasts.

## Diagram behavior

- One solid path per selected approach represents portfolio value after the approach's retirement spending rule.
- A same-color dotted path represents the counterfactual value with no withdrawals after FIRE. It follows the same accumulation path until FIRE, then compounds without retirement spending.
- The FIRE month is marked on each path. Before it, business-profit contributions and pre-FIRE travel outflows apply. From the following month, contributions and pre-FIRE travel stop and the retirement approach begins.
- Show the selected end age and terminal value/depletion status. For dividend-only, show income coverage/shortfall as well as portfolio value; an income shortfall does not silently trigger principal sales.
- The chart is expressed in today's money and can display EUR or converted RON. FX assumptions are visible and editable.
- Hovering the chart shows a month-accurate crosshair and an on-chart tooltip with spend-adjusted and no-withdrawal values for each selected approach; clicking pins an age for comparison. A keyboard-accessible age slider offers the same comparison.
- Zoom and pan controls navigate the time axis; reset restores the full horizon. The legend can focus an approach, and the no-withdrawal paths can be toggled independently.

## Travel budget behavior

For each selected retirement approach and selected spending scenario, find the largest recurring annual **pre-FIRE** travel budget whose projected FIRE date is at most the configured delay cap later than that approach's baseline. Pre-FIRE travel costs reduce investable cash flow. A separate recurring post-FIRE travel amount is added to the retirement target and spending path. The solver allowance is recomputed immediately when relevant assumptions change. If a baseline never reaches FIRE by the selected end age, report that a delay-bounded allowance cannot be calculated.

## Persistence and privacy

- Inputs are stored locally in browser `localStorage`; no financial data is sent to a server.
- The user may explicitly refresh EUR/RON from the ECB reference API. This manual request sends no plan inputs; the rate and observation date are stored with the local plan. No FX request runs on page load.
- JSON export/import is supported.
- The default dividend-yield assumption is part of reset/default settings. User edits persist until reset or import.
- External facts used to explain default assumptions are linked from tooltips and documented in `ASSUMPTIONS_AND_SOURCES.md`.

## Out of scope for this iteration

- Personalized investment allocation advice, security selection, automatic trading, or a claim that any allocation is “safest.”
- Product-specific availability research, broker execution verification, and recommendations for Romanian residents. Broad asset-class planning assumptions do not establish that a particular product is available.
- Jurisdiction-specific tax calculation, pension/social-security entitlement research, and rental tax.
- Historical sequence-of-return replay; the optional Monte Carlo view uses configurable statistical assumptions.
- Property appreciation, amortization, sale proceeds, and counting property equity as liquid FIRE assets.
