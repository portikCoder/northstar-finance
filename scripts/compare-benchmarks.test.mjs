import assert from 'node:assert/strict'
import test from 'node:test'
import { compareBenchmarkReports } from './compare-benchmarks.mjs'

function report(values) {
  return {
    files: [{
      groups: [{
        benchmarks: Object.entries(values).map(([name, mean]) => ({ name, mean })),
      }],
    }],
  }
}

test('passes equivalent benchmarks and tolerates a new benchmark without a baseline', () => {
  const comparisons = compareBenchmarkReports(
    report({ 'deterministic projection': 10 }),
    report({ 'deterministic projection': 11, 'new workload': 3 }),
  )

  assert.equal(comparisons[0].passed, true)
  assert.deepEqual(comparisons[1], { name: 'new workload', skipped: true })
})

test('fails when a regular benchmark exceeds its 25% regression budget', () => {
  const [comparison] = compareBenchmarkReports(
    report({ 'travel allowance': 10 }),
    report({ 'travel allowance': 12.6 }),
  )

  assert.equal(comparison.passed, false)
})

test('uses a wider budget for the single-sample Monte Carlo workload', () => {
  const [withinBudget] = compareBenchmarkReports(
    report({ 'Power user Monte Carlo': 10 }),
    report({ 'Power user Monte Carlo': 13.9 }),
  )
  const [overBudget] = compareBenchmarkReports(
    report({ 'Power user Monte Carlo': 10 }),
    report({ 'Power user Monte Carlo': 14.1 }),
  )

  assert.equal(withinBudget.passed, true)
  assert.equal(overBudget.passed, false)
})

test('rejects reports that contain no matching benchmark names', () => {
  assert.throws(
    () => compareBenchmarkReports(report({ old: 10 }), report({ new: 10 })),
    /No current benchmarks matched the baseline/,
  )
})
