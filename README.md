# Northstar — personal FIRE planner

The aim is to bring FIRE numbers closer to reliable, realistic estimates that point in a clear direction without implying a smooth path to reach them.

A local-first, editable FIRE projection and travel-budget planner. Inputs are saved in the current browser using `localStorage`; the app has no backend and does not send financial data to a server. Export/import a JSON file to back up or move a plan.

## How this project is built

This is an agentic-coded project: AI coding agents help create and maintain its code and documentation, guided and reviewed by a human.

## Run locally

```sh
npm install
npm run dev
```

Run the model tests with `npm test`, run the calculation performance benchmarks with `npm run benchmark`, and run the browser smoke test with `npm run test:e2e`. Create a production build with `npm run build`. See [`docs/PERFORMANCE_TESTING.md`](docs/PERFORMANCE_TESTING.md) for the performance budgets and browser setup.

## Source of truth

Read [`docs/README.md`](docs/README.md) first. It links the product plan, calculation model, portfolio-module architecture, sourced assumptions, and performance verification. Keep those documents in sync with calculation or product changes.

## Current calculation scope

- Compare total-return withdrawals, dividend-only income, and a planned drawdown through a configurable end age (default 90) and terminal balance (default €0).
- In the interactive chart, solid paths account for each retirement method's spending; dotted paths show counterfactual growth without withdrawals. Hover shows exact monthly values in an on-chart tooltip; click to pin or use the age slider to compare paths. Zoom, pan, focus an approach, and toggle counterfactual paths. Contributions and pre-FIRE travel costs stop at each FIRE boundary.
- Pre-FIRE travel allowances are calculated separately per approach under a configurable maximum FIRE delay; a separate post-FIRE travel budget affects retirement targets and spending.
- Optional effective dividend tax, per-approach nominal-return overrides, pension/business income streams, and property rental cash flow can be entered. Property equity remains outside liquid FIRE targets.
- A seeded Monte Carlo view illustrates return-sequence variability. Simple setup uses portfolio-wide return and volatility assumptions; Power user samples correlated sleeve-level returns. Results are not forecasts or guarantees.
- Choose Simple setup (portfolio-wide assumptions) or Power user setup (separate current and target equity/bond mixes, rebalancing, sleeve returns/fees/yields/volatility, and correlation). Weighted inputs feed FIRE projections, dividend income, and correlated asset-level Monte Carlo paths. Power user also compares deterministic outcomes for keeping the current mix versus applying the target mix; defaults preserve the existing 100%-equity baseline.
- Capital-gains tax, rental tax, property appreciation/sale, and jurisdiction-specific tax calculations remain out of scope. The EUR/RON placeholder remains editable and can be manually refreshed from the ECB reference API; no rate request runs automatically.
