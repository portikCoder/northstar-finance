# Performance and end-to-end checks

## Benchmarks

Run `npm run benchmark` to measure three user-visible calculation workloads:

- deterministic projections for all three retirement approaches;
- all three pre-FIRE travel allowance searches;
- the default 1,000-run Power user Monte Carlo calculation for all three approaches.

The Monte Carlo benchmark intentionally processes the normal run count. It is expected to take several seconds because it measures the worker's full workload; avoid changing it to a smaller run count just to make the benchmark look fast. Vitest reports single-sample timings for this long-running case and repeated samples for the quicker workloads. Capture benchmark output before and after calculation changes on the same machine/runtime and compare like-for-like; cross-machine timings are not a stable baseline. `npm test` also enforces a generous 1-second ceiling on the three-mode travel solver to catch major interactive regressions without treating small machine-to-machine timing variation as a failure.

`App.tsx` keeps deterministic projection results independent from Monte Carlo result state. Travel allowance searches are memoized separately from the travel-preview amount, so a preview-slider change or completed worker response does not rerun the 42-step allowance solver. The benchmarks cover the model workloads behind those interactive updates; the browser test checks that the complete Power user update remains functional.

## Browser smoke test

Run `npm run test:e2e`. Playwright starts Vite on `127.0.0.1:4173`, opens a fresh Chromium context, switches to Power user setup, changes the target mix to 50/50, and checks the weighted assumptions, current-vs-target comparison, and browser console/page errors. The target-mix update has a generous 2.5-second interaction budget to catch major UI-thread regressions.

Install the browser once per machine with `npx playwright install chromium` if Playwright reports that its Chromium executable is missing. The test uses an isolated browser context and does not read or modify the regular profile's saved plan.

## Release checks

```sh
npm test
npm run benchmark
npm run test:e2e
npm run build
```
