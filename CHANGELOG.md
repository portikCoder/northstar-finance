# Changelog

Summary of the first working version of Northstar.

## [0.1.0] - 2026-10-22

### Added

- Local-first FIRE planning with three independently modeled strategies: total-return withdrawals, dividend-only income, and planned drawdown through a configurable end age and terminal balance.
- Simple portfolio assumptions and a Power user equity/bond mix with current and target allocations, sleeve-level return/risk/fee/yield inputs, rebalancing, and a deterministic current-versus-target comparison.
- Seeded Monte Carlo sequence-risk analysis, calculated in a background worker, plus interactive portfolio projections with age inspection, zoom, pan, and counterfactual paths.
- A delay-bounded pre-FIRE travel budget and a separate post-FIRE travel-spending input.
- Optional income streams, property cash flow, return overrides, editable currency assumptions, local plan persistence, and JSON import/export.
- Calculation tests, performance benchmarks and budgets, and a Playwright Power user smoke test.

### Scope and assumptions

- Results are editable, assumption-driven planning scenarios—not forecasts, guarantees, or investment recommendations. The default Power user allocation preserves the prior 100%-equity baseline; bond assumptions are editable placeholders.
- Financial inputs stay in browser storage. Tax modeling is limited to an optional effective dividend-tax input; capital-gains and rental taxes are not modeled.
- Detailed formulas and dated source research are maintained separately from these release notes.

### Verification

- 46 unit and performance-budget tests passed.
- Power user 50/50 mix Playwright smoke test passed.
- TypeScript checks and production build passed.
