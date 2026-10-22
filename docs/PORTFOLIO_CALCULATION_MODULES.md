# Portfolio calculation modules

This note describes the implementation boundaries for the Simple and Power user portfolio setups. Product behavior is specified in [PRODUCT_SPEC.md](PRODUCT_SPEC.md); formulas and financial-model limitations are in [CALCULATION_MODEL.md](CALCULATION_MODEL.md).

## Runtime flow

1. `PlanInputs` in `src/model.ts` is the persisted plan contract. `planPersistence.ts` parses, validates, and migrates stored/imported plans. `App.tsx` edits those inputs, displays derived assumptions, and recalculates projections.
2. In Simple setup, the model uses one portfolio-wide nominal return, fee, volatility, and distribution yield.
3. In Power user setup, the current equity/bond mix allocates the starting balance; the target mix directs positive contributions. Each sleeve has editable nominal return, volatility, fee, and distribution yield. The correlation input is used for aggregate volatility and Monte Carlo path generation.
4. `projectRetirement` and its private simulation apply each sleeve's real monthly return, contribution/cash-flow rules, and the selected rebalancing schedule. FIRE targets and drawdown targets use the weighted target-mix assumptions. Dividend-only targets use the weighted target yield; retirement cash income uses the opening balance and yield of each sleeve.
5. `App.tsx` runs the deterministic “keep current mix” comparison by evaluating a copy of the inputs whose target mix equals the entered current mix. The target-mix result uses the selected target contribution allocation. Both scenarios use the same starting mix, sleeve assumptions, spending, and rebalancing schedule. Funding status is a deterministic pass/fail result, not a Monte Carlo percentage.
6. `monteCarlo.worker.ts` runs the three retirement modes off the UI thread. In Power user setup, each Monte Carlo run receives correlated sleeve-level return paths; the worker consumes paths one run at a time rather than retaining every run's paths in memory.

## Calculation modules

| Module | Responsibility | Main exports | Tests |
| --- | --- | --- | --- |
| `src/portfolioAllocation.ts` | Current/target weight allocation, sleeve returns, positive contributions, pro-rata cash outflows, and rebalancing | `allocateStartingBalance`, `allocateContribution`, `applySleeveReturns`, `applyPortfolioCashflow`, `rebalanceToTargetWeights` | `src/portfolioAllocation.test.ts` |
| `src/powerPortfolio.ts` | Canonical equity/bond sleeve definitions, current/target weights, and symmetric correlation matrix shared by the model paths | `buildPowerPortfolioConfiguration` | `src/powerPortfolio.test.ts` |
| `src/portfolioSleeves.ts` | Weight-normalized gross return, weighted fees, net nominal return, distribution yield, and covariance-based volatility | `calculatePortfolioSleeveAssumptions` | `src/portfolioSleeves.test.ts` |
| `src/portfolioComparison.ts` | Outcome deltas from a selected baseline while preserving scenario order | `comparePortfolioOutcomes` | `src/portfolioComparison.test.ts` |
| `src/portfolioSequence.ts` | Seeded correlated lognormal monthly returns, Cholesky factorization, and correlation-matrix validation | `iteratePortfolioSequenceRuns`, `generatePortfolioSequence` | `src/portfolioSequence.test.ts` |

These modules are pure calculations and do not import React, browser storage, or `model.ts`. `model.ts` owns planner-specific orchestration and supplies inputs to the modules. Keep new arithmetic in a focused module when it can be tested independently; update the orchestration and this note when integration behavior changes.

The Monte Carlo integration uses `iteratePortfolioSequenceRuns` so only one run's monthly sleeve path is held at a time. `generatePortfolioSequence` is a convenience collector for callers that explicitly need all paths in memory; do not use it for the full production run count and horizon.

## Important contracts

- **Weights:** The UI represents a two-sleeve allocation with one equity percentage and a complementary bond percentage. Generic helper modules normalize weights; the planner's UI keeps current and target allocations at 100% by construction.
- **Starting balance and contributions:** The starting balance follows current weights. Positive contributions follow target weights. Negative cash flows and withdrawals are reduced pro rata from current balances and cannot take the portfolio below zero.
- **Rebalancing:** `monthly` rebalances after each month's return and cash flow; `annually` rebalances after months 12, 24, and so on; `never` allows weights to drift. There are no modeled transaction costs or taxes for rebalancing.
- **Returns and fees:** Power-user sleeve nominal returns are total-return assumptions. Sleeve fees are deducted before inflation adjustment. The approach-specific return override shifts each sleeve's nominal return by the difference between the override and the weighted gross return.
- **Distributions:** Sleeve cash yields are not added on top of total return during accumulation. In dividend-only retirement, the model computes cash from each sleeve's opening balance and yield, applies the effective dividend-tax input, spends distributions up to the need, and does not sell principal to cover a shortfall.
- **Correlation:** The current planner exposes one equity/bond correlation. The path generator validates the supplied matrix and supports positive-semidefinite matrices; the UI's two-sleeve matrix is symmetric with diagonal values of one.
- **Monte Carlo:** Seeded paths are reproducible for a given input set. Sleeve returns are sampled jointly using the correlation matrix; each simulation run is processed independently. Results remain assumption-driven scenarios, not forecasts.
- **Persistence compatibility:** New setup fields live in `PlanInputs`, `localStorage`, and JSON export. Loading and importing plans validate known fields and merge older shapes over fresh `DEFAULT_INPUTS` copies, so missing fields inherit defaults while malformed values are rejected.

## Gradual file split

- `App.tsx` remains the page-level composition and state orchestration. `FormControls.tsx` owns shared field/tooltip widgets, and `planPersistence.ts` owns storage parsing and validation. Next, move the interactive projection chart into its own presentation module, then consider grouping the power-setup and travel UI as separate components.
- `model.ts` remains the public calculation API while focused modules take ownership of independent concerns. `powerPortfolio.ts` now provides the canonical sleeve/correlation configuration consumed by weighted assumptions, deterministic returns, and Monte Carlo. The next extraction candidate is the deterministic projection engine; preserve existing `model.ts` exports as a facade and retain the current model-level tests while moving one responsibility at a time.

## Verification

Run `npm test` for the focused and model-level suites, `npm run benchmark` for projection, travel-search, and Monte Carlo timings, `npm run test:e2e` for the Power user mix browser smoke test, then `npm run build` for TypeScript and production-bundle checks. Portfolio calculations have direct pure-function tests in addition to integration tests in `src/model.test.ts`. See [performance testing](PERFORMANCE_TESTING.md) for interpretation and thresholds.

## Scope limits to preserve

The UI currently has two sleeves, one static correlation, and fixed nominal return/volatility/yield assumptions over the projection. It does not model named securities, Romanian product eligibility, broker execution, currency hedging, changing correlations, intramonth transactions, rebalancing costs, or jurisdiction-specific taxes. Keep generic defaults explicitly labeled as editable illustrative assumptions; do not turn them into availability claims or recommendations.
