import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, parseCliArgs } from './trader-lib.mjs'
import {
  evaluateJarvisStrategySnapshot,
  fetchStrategyKlines,
  intervalToMs,
} from './jarvis-strategy.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const DAY = 24 * 60 * 60_000

function finitePositive(value, fallback, name) {
  const n = Number(value ?? fallback)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be > 0`)
  return n
}

function pct(value, digits = 2) {
  return Number.isFinite(value) ? `${value.toFixed(digits)}%` : 'n/a'
}

function round(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null
}

async function fetchHistoricalKlines(symbol, interval, fromTs, toTs, config) {
  const byTs = new Map()
  let end = toTs
  let pages = 0
  const maxPages = 100

  while (pages < maxPages) {
    pages += 1
    const batch = await fetchStrategyKlines(symbol, interval, 1000, config, end)
    if (!batch.length) break

    for (const candle of batch) {
      if (candle.ts >= fromTs && candle.ts <= toTs) byTs.set(candle.ts, candle)
    }

    const oldest = batch[0].ts
    if (oldest <= fromTs) break
    if (oldest >= end) throw new Error(`Bybit history pagination stalled for ${interval}`)
    end = oldest - 1
  }

  if (pages >= maxPages) throw new Error(`History pagination exceeded ${maxPages} pages for ${interval}`)
  return [...byTs.values()]
    .filter((c) => c.ts + intervalToMs(interval) <= toTs)
    .sort((a, b) => a.ts - b.ts)
}

function upperBoundClosed(candles, interval, closeTime) {
  const ms = intervalToMs(interval)
  let lo = 0
  let hi = candles.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (candles[mid].ts + ms <= closeTime) lo = mid + 1
    else hi = mid
  }
  return lo
}

function lastClosedSlice(candles, interval, closeTime, count = 260) {
  const end = upperBoundClosed(candles, interval, closeTime)
  return candles.slice(Math.max(0, end - count), end)
}

function tradeExit({ signal, candles, entryIndex, feeBpsPerSide, slippageBpsPerSide }) {
  const entryCandle = candles[entryIndex]
  if (!entryCandle) return null

  const side = signal.action.toLowerCase()
  const entry = entryCandle.open
  const stopPct = signal.stopPct
  const takePct = signal.takePct
  const stop = side === 'long' ? entry * (1 - stopPct / 100) : entry * (1 + stopPct / 100)
  const take = side === 'long' ? entry * (1 + takePct / 100) : entry * (1 - takePct / 100)

  let exit = candles.at(-1).close
  let exitIndex = candles.length - 1
  let exitReason = 'END'

  for (let i = entryIndex; i < candles.length; i += 1) {
    const c = candles[i]
    const stopHit = side === 'long' ? c.low <= stop : c.high >= stop
    const takeHit = side === 'long' ? c.high >= take : c.low <= take

    if (stopHit && takeHit) {
      exit = stop
      exitIndex = i
      exitReason = 'SL_SAME_BAR_CONSERVATIVE'
      break
    }
    if (stopHit) {
      exit = stop
      exitIndex = i
      exitReason = 'SL'
      break
    }
    if (takeHit) {
      exit = take
      exitIndex = i
      exitReason = 'TP'
      break
    }
  }

  const grossPct = side === 'long'
    ? ((exit - entry) / entry) * 100
    : ((entry - exit) / entry) * 100
  const roundTripCostPct = 2 * (feeBpsPerSide + slippageBpsPerSide) / 100
  const netPct = grossPct - roundTripCostPct
  const r = netPct / stopPct

  return {
    side,
    signalTime: signal.signalTime,
    entryTime: entryCandle.ts,
    exitTime: candles[exitIndex].ts,
    entry,
    exit,
    stop,
    take,
    stopPct,
    takePct,
    score: signal.score,
    grossPct,
    modeledCostPct: roundTripCostPct,
    netPct,
    r,
    exitReason,
    exitIndex,
  }
}

function maxConsecutiveLosses(trades) {
  let current = 0
  let max = 0
  for (const trade of trades) {
    if (trade.r <= 0) {
      current += 1
      max = Math.max(max, current)
    } else {
      current = 0
    }
  }
  return max
}

function metrics(trades, riskPct = 0.25, startingEquity = 10_000) {
  if (!trades.length) {
    return {
      trades: 0,
      wins: 0,
      losses: 0,
      winRatePct: 0,
      expectancyR: 0,
      totalR: 0,
      profitFactor: null,
      maxDrawdownPct: 0,
      maxConsecutiveLosses: 0,
      endingEquity: startingEquity,
      returnPct: 0,
    }
  }

  const wins = trades.filter((t) => t.r > 0)
  const losses = trades.filter((t) => t.r <= 0)
  const grossWinR = wins.reduce((s, t) => s + t.r, 0)
  const grossLossR = Math.abs(losses.reduce((s, t) => s + t.r, 0))
  const totalR = trades.reduce((s, t) => s + t.r, 0)

  let equity = startingEquity
  let peak = equity
  let maxDd = 0
  for (const trade of trades) {
    equity *= 1 + (riskPct / 100) * trade.r
    peak = Math.max(peak, equity)
    maxDd = Math.max(maxDd, peak > 0 ? ((peak - equity) / peak) * 100 : 0)
  }

  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct: wins.length / trades.length * 100,
    expectancyR: totalR / trades.length,
    totalR,
    profitFactor: grossLossR > 0 ? grossWinR / grossLossR : null,
    maxDrawdownPct: maxDd,
    maxConsecutiveLosses: maxConsecutiveLosses(trades),
    endingEquity: equity,
    returnPct: ((equity - startingEquity) / startingEquity) * 100,
  }
}

function seededRandom(seed = 0x4a415256) {
  let state = seed >>> 0
  return () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function quantile(values, q) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = (sorted.length - 1) * q
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

function monteCarloBootstrap(trades, runs, riskPct, startingEquity) {
  if (trades.length < 5 || runs <= 0) return null
  const rand = seededRandom()
  const ending = []
  const drawdowns = []

  for (let run = 0; run < runs; run += 1) {
    const sample = []
    for (let i = 0; i < trades.length; i += 1) {
      sample.push(trades[Math.floor(rand() * trades.length)])
    }
    const m = metrics(sample, riskPct, startingEquity)
    ending.push(m.endingEquity)
    drawdowns.push(m.maxDrawdownPct)
  }

  return {
    runs,
    endingEquityP05: quantile(ending, 0.05),
    endingEquityP50: quantile(ending, 0.50),
    endingEquityP95: quantile(ending, 0.95),
    maxDrawdownP50: quantile(drawdowns, 0.50),
    maxDrawdownP95: quantile(drawdowns, 0.95),
  }
}

function walkForwardSegments(trades, startTs, endTs, count, riskPct, startingEquity) {
  const span = endTs - startTs
  const out = []
  for (let i = 0; i < count; i += 1) {
    const from = startTs + span * i / count
    const to = startTs + span * (i + 1) / count
    const segmentTrades = trades.filter((t) => t.entryTime >= from && (i === count - 1 ? t.entryTime <= to : t.entryTime < to))
    out.push({
      segment: i + 1,
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      ...metrics(segmentTrades, riskPct, startingEquity),
    })
  }
  return out
}

async function runBacktest() {
  const args = parseCliArgs(process.argv.slice(2))
  const config = loadConfig()
  const symbol = String(args.symbol || 'BTC').toUpperCase()
  const days = finitePositive(args.days, config.strategyLab?.days ?? 30, 'days')
  const warmupDays = finitePositive(args.warmupDays, config.strategyLab?.warmupDays ?? 40, 'warmupDays')
  const feeBpsPerSide = finitePositive(args.feeBps, config.strategyLab?.feeBpsPerSide ?? 6, 'feeBps')
  const slippageBpsPerSide = finitePositive(args.slippageBps, config.strategyLab?.slippageBpsPerSide ?? 2, 'slippageBps')
  const researchRiskPct = finitePositive(args.riskPct, config.strategyLab?.researchRiskPct ?? 0.25, 'riskPct')
  const startingEquity = finitePositive(args.equity, config.strategyLab?.startingEquity ?? 10_000, 'equity')
  const monteCarloRuns = Math.max(0, Math.floor(Number(args.monteCarlo ?? config.strategyLab?.monteCarloRuns ?? 500)))
  const endTs = Date.now()
  const startTs = endTs - days * DAY
  const historyStart = startTs - warmupDays * DAY

  console.log(`JARVIS Strategy Lab — ${symbol}, ${days} day backtest`)
  console.log('Downloading closed-candle history from Bybit Demo public market-data API...')

  const [c4h, c1h, c15m] = await Promise.all([
    fetchHistoricalKlines(symbol, '240', historyStart, endTs, config),
    fetchHistoricalKlines(symbol, '60', historyStart, endTs, config),
    fetchHistoricalKlines(symbol, '15', historyStart, endTs, config),
  ])

  if (c4h.length < 220 || c1h.length < 220 || c15m.length < 220) {
    throw new Error(`Insufficient history: 4H=${c4h.length}, 1H=${c1h.length}, 15m=${c15m.length}`)
  }

  const trades = []
  let waits = 0
  let candidateSignals = 0

  for (let i = 219; i < c15m.length - 1; i += 1) {
    const decisionCandle = c15m[i]
    if (decisionCandle.ts < startTs) continue
    const decisionClose = decisionCandle.ts + intervalToMs('15')
    const s4h = lastClosedSlice(c4h, '240', decisionClose, 260)
    const s1h = lastClosedSlice(c1h, '60', decisionClose, 260)
    const s15m = c15m.slice(Math.max(0, i - 259), i + 1)
    if (s4h.length < 220 || s1h.length < 220 || s15m.length < 220) continue

    const signal = evaluateJarvisStrategySnapshot({ symbol, c4h: s4h, c1h: s1h, c15m: s15m, config })
    if (signal.action === 'WAIT') {
      waits += 1
      continue
    }

    candidateSignals += 1
    signal.signalTime = decisionClose
    const trade = tradeExit({
      signal,
      candles: c15m,
      entryIndex: i + 1,
      feeBpsPerSide,
      slippageBpsPerSide,
    })
    if (!trade) continue
    trades.push(trade)
    i = Math.max(i, trade.exitIndex)
  }

  const splitTs = startTs + (endTs - startTs) * 0.70
  const inSample = trades.filter((t) => t.entryTime < splitTs)
  const outOfSample = trades.filter((t) => t.entryTime >= splitTs)
  const allMetrics = metrics(trades, researchRiskPct, startingEquity)
  const inMetrics = metrics(inSample, researchRiskPct, startingEquity)
  const outMetrics = metrics(outOfSample, researchRiskPct, startingEquity)
  const longMetrics = metrics(trades.filter((t) => t.side === 'long'), researchRiskPct, startingEquity)
  const shortMetrics = metrics(trades.filter((t) => t.side === 'short'), researchRiskPct, startingEquity)
  const walkForward = walkForwardSegments(trades, startTs, endTs, 4, researchRiskPct, startingEquity)
  const monteCarlo = monteCarloBootstrap(trades, monteCarloRuns, researchRiskPct, startingEquity)

  const report = {
    engine: 'JARVIS_STRATEGY_LAB_V1',
    strategy: config.strategy?.name || 'JARVIS_ORIGINAL_MTF_V1',
    symbol,
    period: {
      from: new Date(startTs).toISOString(),
      to: new Date(endTs).toISOString(),
      days,
      warmupDays,
    },
    data: { candles4h: c4h.length, candles1h: c1h.length, candles15m: c15m.length },
    assumptions: {
      entry: 'next 15m candle open after a closed-candle signal',
      sameBarTpAndSl: 'stop-loss first (conservative)',
      feeBpsPerSide,
      slippageBpsPerSide,
      researchRiskPct,
      startingEquity,
      onePositionAtATime: true,
      noAveragingDown: true,
      leverage: 1,
    },
    signalStats: { candidateSignals, waits },
    metrics: allMetrics,
    inSample70: inMetrics,
    outOfSample30: outMetrics,
    bySide: { long: longMetrics, short: shortMetrics },
    walkForward,
    monteCarlo,
    trades,
    generatedAt: new Date().toISOString(),
  }

  console.table([
    { scope: 'ALL', trades: allMetrics.trades, winRate: pct(allMetrics.winRatePct), expectancyR: round(allMetrics.expectancyR, 3), profitFactor: round(allMetrics.profitFactor, 3), maxDD: pct(allMetrics.maxDrawdownPct), return: pct(allMetrics.returnPct) },
    { scope: 'IN 70%', trades: inMetrics.trades, winRate: pct(inMetrics.winRatePct), expectancyR: round(inMetrics.expectancyR, 3), profitFactor: round(inMetrics.profitFactor, 3), maxDD: pct(inMetrics.maxDrawdownPct), return: pct(inMetrics.returnPct) },
    { scope: 'OOS 30%', trades: outMetrics.trades, winRate: pct(outMetrics.winRatePct), expectancyR: round(outMetrics.expectancyR, 3), profitFactor: round(outMetrics.profitFactor, 3), maxDD: pct(outMetrics.maxDrawdownPct), return: pct(outMetrics.returnPct) },
    { scope: 'LONG', trades: longMetrics.trades, winRate: pct(longMetrics.winRatePct), expectancyR: round(longMetrics.expectancyR, 3), profitFactor: round(longMetrics.profitFactor, 3), maxDD: pct(longMetrics.maxDrawdownPct), return: pct(longMetrics.returnPct) },
    { scope: 'SHORT', trades: shortMetrics.trades, winRate: pct(shortMetrics.winRatePct), expectancyR: round(shortMetrics.expectancyR, 3), profitFactor: round(shortMetrics.profitFactor, 3), maxDD: pct(shortMetrics.maxDrawdownPct), return: pct(shortMetrics.returnPct) },
  ])

  console.log('\nWalk-forward quarters:')
  console.table(walkForward.map((s) => ({
    segment: s.segment,
    trades: s.trades,
    winRate: pct(s.winRatePct),
    expectancyR: round(s.expectancyR, 3),
    profitFactor: round(s.profitFactor, 3),
    maxDD: pct(s.maxDrawdownPct),
    return: pct(s.returnPct),
  })))

  if (monteCarlo) {
    console.log('\nMonte Carlo bootstrap:')
    console.table([{
      runs: monteCarlo.runs,
      equityP05: round(monteCarlo.endingEquityP05, 2),
      equityP50: round(monteCarlo.endingEquityP50, 2),
      equityP95: round(monteCarlo.endingEquityP95, 2),
      maxDdP50: pct(monteCarlo.maxDrawdownP50),
      maxDdP95: pct(monteCarlo.maxDrawdownP95),
    }])
  }

  const outPath = join(here, `backtest-${symbol.toLowerCase()}-${Math.round(days)}d.json`)
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
  console.log(`\nReport saved: ${outPath}`)
  console.log('Research only. This command cannot submit an order.')
}

runBacktest().catch((error) => {
  console.error(error)
  process.exit(1)
})
