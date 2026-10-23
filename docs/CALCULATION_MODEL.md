# Core calculation model

All calculations are performed in EUR and today's money. Monthly simulation is used so quarterly/irregular contributions and the FIRE phase boundary are represented consistently. Display conversion to RON is presentation-only.

## Inputs and rates

- Current portfolio is the sum of EUR market value and USD market value converted at the editable USD→EUR rate. Unrealized gains are not added again.
- Annual business contributions are gross profit less the business reinvestment reserve. Apply the selected deposit schedule; irregular mode uses the four editable gross quarterly amounts.
- Nominal portfolio return is a total-return assumption. Deduct the annual fee, then deflate by inflation:

  `realAnnualReturn = (1 + (nominalReturn - annualFee)) / (1 + inflation) - 1`

- Convert real annual return to an effective monthly return:

  `rMonthly = (1 + realAnnualReturn)^(1/12) - 1`

- In this iteration, dividends are included in the total-return assumption during accumulation. The dividend-only retirement path pays distributions out instead of reinvesting the portion spent. Do not add dividend yield on top of total return.
- Each retirement approach uses its optional nominal-return override when set; otherwise it uses the shared nominal return. This is a scenario comparison input, not an implied or recommended allocation. The 1.9% reference yield does not define the illustrative mix's capital-return forecast.
- In **Simple** setup, the shared nominal return, fee, volatility, and dividend yield are entered directly. In **Power user** setup, let `wE` be the target equity weight and `wB = 1 - wE` the EUR-government-bond weight. Weighted gross return, annual fee, and distribution yield are the weighted averages of the sleeve assumptions; net nominal return is weighted gross return minus weighted fee. Portfolio volatility is `sqrt(wE² × equityVolatility² + wB² × bondVolatility² + 2 × wE × wB × correlation × equityVolatility × bondVolatility)`. Sleeve returns, fees, yields, volatilities, and weights are entered as percentages; correlation is in `[-1, 1]`.
- Power-user starting balances use the separately entered current mix. Positive contributions follow target weights; negative cash flows and retirement withdrawals are taken pro rata from current sleeve balances. Each sleeve compounds using its own return, fee, and inflation-adjusted monthly rate. Monthly/annual rebalancing moves balances to target weights after that month's returns and cash flows; `never` leaves balances at their drifted weights. An approach-specific return override shifts each sleeve's nominal return by the difference between the override and the weighted gross return. The dividend-only target uses the target mix's weighted yield, while actual retirement income is calculated from each sleeve's balance and yield.
- Optional income streams and net property rent are entered in today's EUR. Income streams are active from their start age up to (but not including) their optional end age. Net rental cash flow is gross rent less entered operating costs and mortgage payment. Net rental cash flow is added to the liquid portfolio before FIRE and offsets portfolio-funded spending after FIRE. Any positive income beyond expenses is saved in the portfolio. Property value/equity is shown separately and is excluded from liquid FIRE targets; mortgage amortization, sale proceeds, rent tax, and property appreciation are not projected.

## Accumulation and FIRE boundary

For each month before FIRE, where `travelAnnual` is the selected annual travel budget and `contributionMonth` is the net scheduled business contribution:

`balanceNext = max(0, balance × (1 + rMonthly) + contributionMonth + netRent - travelAnnual / 12)`

This scalar equation describes Simple setup. In Power user setup, initialize equity/bond balances using the current mix, apply each sleeve's own monthly return, allocate positive cash flows using target weights, take negative cash flows pro rata, and then apply the chosen rebalancing schedule. In the retirement formulas below, `balance` means the sum of Power user sleeve balances when that setup is active.

Check the approach-specific FIRE condition at the end of the month. If crossed, record that month as FIRE. Business contributions and pre-FIRE travel outflows stop from the following month. In the no-travel baseline, `travelAnnual = 0`.

## Approach A — total-return withdrawal-rate

The target uses spending less active external income and net rent, plus the separate post-FIRE travel amount:

`fireNumber = max(0, annualPortfolioFundedSpend) / withdrawalRate`

After FIRE, real retirement spending plus post-FIRE travel is reduced by active income and net rent. In Simple setup, the resulting portfolio-funded amount is withdrawn monthly:

`balanceNext = max(0, balance × (1 + rMonthly) - monthlyPortfolioFundedSpend)`

Power user applies each sleeve's real return first, then reduces sleeve balances pro rata by the portfolio-funded withdrawal and rebalances if scheduled.

Record the first month the balance reaches zero as depletion. At the selected end age, report remaining balance or depletion. This lets the user see what the configured deterministic return path implies; it does not establish a safe withdrawal rate. A fixed real withdrawal can exhaust wealth even if the initial target was reached.

## Approach B — dividends-only

The effective net distribution yield is the Simple setup yield or Power user's weighted target-mix yield after the editable effective dividend-tax percentage. The initial target is:

`fireNumber = annualPortfolioFundedSpend / (portfolioDistributionYield × (1 - dividendTaxRate))`

The default yield is a gross distribution-yield proxy, before personal tax. In Simple setup, estimate cash distribution from the opening portfolio balance:

`grossDividendCash = balance × dividendYield / 12`

In Power user setup, use the opening balance of each sleeve and its own distribution-yield assumption:

`grossDividendCash = Σ(openingSleeveBalance × sleeveDistributionYield / 12)`

`dividendTax = grossDividendCash × dividendTaxRate`

`netDividendCash = grossDividendCash - dividendTax`

`cashSpent = min(monthlyPortfolioFundedSpend, netDividendCash)`

`incomeShortfall = max(0, monthlyPortfolioFundedSpend - netDividendCash)`

The portfolio's total-return growth includes gross distributions, so subtract distribution tax and only the net cash actually spent from its total-return-grown value. Unspent net distributions remain invested. This is an effective-rate planning approximation, not a jurisdiction-specific tax calculation.

`balanceNext = max(0, balance × (1 + rMonthly) - dividendTax - cashSpent)`

Do not silently sell shares to fill an income shortfall. Report income shortfall separately. In Power user setup, compute gross cash by sleeve from its opening balance and distribution yield, aggregate the cash, then apply the same tax and spending limits; deductions are taken pro rata from sleeve balances. This is an idealized constant-yield assumption: real distributions can change, be cut, and be taxed differently. An accumulating fund reinvests its cash distributions internally; it is not a spendable cash-income share class. For a true cash-income comparison, the relevant yield should correspond to distributing holdings or an explicit bond-coupon plan.

## Approach C — planned drawdown

The required portfolio at a candidate retirement age is the present value of each month's real spending, including post-FIRE travel and less active income/net rent, through the configured end age plus the terminal balance floor. Let `N = max(0, round((endAge - retirementAge) × 12))` and `r = rMonthly`:

`PV(spend) = Σ((monthlyRetirementSpend + monthlyTravel - activeIncome - netRent) / (1 + r)^month)`

`PV(floor) = terminalFloor / (1 + r)^N`

`requiredPortfolio = PV(spend) + PV(floor)`

When `r` is approximately zero, use the undiscounted sum of monthly portfolio-funded spending. Handle valid negative real returns with the monthly discount formula; guard against invalid rate domains. The required target is age-dependent: at each pre-FIRE month, compare the current balance with the present value calculated for the remaining time to end age. After FIRE, simulate monthly returns and withdrawals through end age; report whether the terminal floor is met.

## Counterfactual dotted chart line

For each approach, the dotted no-withdrawal comparator shares the actual accumulation path through its FIRE month. After FIRE it compounds at the same real monthly return without subtracting retirement spending or dividends paid out. In Power user setup, the comparator follows the same sleeve paths and rebalance schedule without post-FIRE spending withdrawals. The solid path follows its selected retirement rule. The gap between the two makes the spending effect visible; the dotted line is a counterfactual, not spendable income or a forecast of what will happen.

## Delay-bounded travel budget

For each selected approach:

1. Simulate its baseline with no extra travel and capture its FIRE month.
2. Binary-search pre-FIRE annual travel spend from zero to the configured search ceiling.
3. For each candidate, reduce pre-FIRE contributions by `candidate / 12`, simulate again, and compare FIRE months. The separately entered post-FIRE travel amount is included in the target and retirement cash flow for both baseline and candidate.
4. Keep the largest candidate whose delay is at most the configured threshold.

If the baseline does not reach FIRE by end age, show no calculable delay-bounded budget rather than implying unlimited travel.

## Sequence-risk view (Monte Carlo)

The optional sequence-risk view runs reproducible, seeded monthly lognormal return paths using the selected approach's nominal-return assumption, volatility, fee, and inflation. Simple setup samples one portfolio path. Power user setup samples correlated sleeve-level paths using the two-sleeve correlation matrix, applies each sleeve's return/fee assumptions, contributions, withdrawals, and rebalancing, and streams runs through the worker one at a time:

`monthlyGrowth = exp((ln(1 + nominalReturn - fee) - volatility² / 2) / 12 + volatility / sqrt(12) × z) / (1 + inflation)^(1/12)`

Each path uses the same contribution, external-income, tax, post-FIRE travel, and withdrawal rules as the deterministic projection. The initial FIRE target remains the deterministic target based on the entered average-return assumption. The summary reports FIRE reach rate, funded-through-end-age rate, and end-balance percentiles. A funded path reaches FIRE, has no depletion, meets the terminal floor, and (for dividend-only) has no modeled income shortfall. These are assumption-driven scenarios, not forecasts or guarantees; pre-FIRE travel preview spending is not applied to the Monte Carlo baseline.

## Important limitations

- Constant return paths hide sequence-of-returns risk. The deterministic results must not be described as guarantees.
- Capital-gains tax, tax on rent, contribution inflation/indexation, and changing yields are not modeled. Dividend tax is a user-entered effective-rate approximation only. Pension and continuing business income are optional user-entered real monthly streams, not researched entitlement estimates.
- The dividend-yield default is a dated illustrative reference, not an objective safest portfolio or a personalized recommendation.
- The Power user portfolio model is limited to two sleeves, one static correlation, and periodic rebalancing; it omits product-specific risk, changing correlations, currency hedging, and jurisdiction-specific taxes. Power-user assumptions are editable placeholders, not researched market expectations or evidence of Romanian product availability. The side-by-side mix comparison is deterministic; its funding status is not a probability.
