import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const REGRESSION_LIMITS = [
  { match: 'Power user Monte Carlo', fraction: 0.4 },
  { match: '', fraction: 0.25 },
]

function collectBenchmarks(report) {
  const benchmarks = new Map()

  for (const file of report.files ?? []) {
    for (const group of file.groups ?? []) {
      for (const benchmark of group.benchmarks ?? []) {
        if (!benchmark.name || !Number.isFinite(benchmark.mean) || benchmark.mean <= 0) {
          throw new TypeError('Benchmark report contains an invalid benchmark name or mean')
        }
        if (benchmarks.has(benchmark.name)) {
          throw new TypeError(`Benchmark report contains a duplicate benchmark: ${benchmark.name}`)
        }
        benchmarks.set(benchmark.name, benchmark.mean)
      }
    }
  }

  return benchmarks
}

export function compareBenchmarkReports(baselineReport, currentReport) {
  const baseline = collectBenchmarks(baselineReport)
  const current = collectBenchmarks(currentReport)
  const comparisons = []

  for (const [name, currentMean] of current) {
    const baselineMean = baseline.get(name)
    if (baselineMean === undefined) {
      comparisons.push({ name, skipped: true })
      continue
    }

    const limit = REGRESSION_LIMITS.find(({ match }) => name.includes(match)).fraction
    const slowdown = currentMean / baselineMean - 1
    comparisons.push({ name, baselineMean, currentMean, limit, slowdown, passed: slowdown <= limit })
  }

  if (comparisons.every(({ skipped }) => skipped)) {
    throw new Error('No current benchmarks matched the baseline; refusing to pass an empty comparison')
  }

  return comparisons
}

async function main() {
  const [baselinePath, currentPath] = process.argv.slice(2)
  if (!baselinePath || !currentPath) {
    throw new Error('Usage: node scripts/compare-benchmarks.mjs <baseline.json> <current.json>')
  }

  const [baseline, current] = await Promise.all([
    readFile(baselinePath, 'utf8').then(JSON.parse),
    readFile(currentPath, 'utf8').then(JSON.parse),
  ])

  const comparisons = compareBenchmarkReports(baseline, current)
  for (const comparison of comparisons) {
    if (comparison.skipped) {
      console.log(`SKIP ${comparison.name}: no baseline benchmark with this name`)
      continue
    }

    const slowdownPercent = comparison.slowdown * 100
    const thresholdPercent = comparison.limit * 100
    const status = comparison.passed ? 'PASS' : 'FAIL'
    console.log(
      `${status} ${comparison.name}: ${comparison.baselineMean.toFixed(3)}ms → `
      + `${comparison.currentMean.toFixed(3)}ms (${slowdownPercent >= 0 ? '+' : ''}${slowdownPercent.toFixed(1)}%; `
      + `limit +${thresholdPercent.toFixed(0)}%)`,
    )
  }

  if (comparisons.some(({ passed }) => passed === false)) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
