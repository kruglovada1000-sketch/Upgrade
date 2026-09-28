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

function round(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null
}

function pct(value, digits = 2) {
  return Number.isFinite(value) ? `${value.toFixed(digits)}%` : 'n/a'
}

function seededRandom(seed = 0x4a415256) {
  let state = seed >>> 0
  return () => {
    state = (1664525 * state + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function pick(rand, values) {
  return values[Math.floor(rand() * values.length)]
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

function lastIndexBefore(candles, endTs) {
  let lo = 0
  let hi = candles.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (candles[mid].ts < endTs) lo = mid + 1
    else hi = mid
  }
  return Math.max(0, lo - 1)
}

function tradeExit({ signal, candles, entryIndex, periodEnd, feeBpsPerSide, slippageBpsPerSide }) {
  const entryCandle = candles[entryIndex]
  if (!entryCandle || entryCandle.ts >= periodEnd) return null

  const side = signal.action.toLowerCase()
  const entry = entryCandle.open
  const stopPct = signal.stopPct
  const takePct = signal.takePct
  const stop = side === 'long' ? entry * (1 - stopPct / 100) : entry * (1 + stopPct / 100)
  const take = side === 'long' ? entry * (1 + takePct / 100) : entry * (1 - takePct / 100)
  const lastAllowed = lastIndexBefore(candles, periodEnd)

  let exit = candles[lastAllowed].close
  let exitIndex = lastAllowed
  let exitReason = 'PERIOD_END'

  for (let i = entryIndex; i <= lastAllowed; i += 1) {
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
  const modeledCostPct = 2 * (feeBpsPerSide + slippageBpsPerSide) / 100
  const netPct = grossPct - modeledCostPct
  const r = netPct / stopPct

  return { side, entryTime: entryCandle.ts, exitTime: candles[exitIndex].ts, r, exitIndex, exitReason }
}

function metrics(trades) {
  if (!trades.length) {
    return { trades: 0, wins: 0, losses: 0, winRatePct: 0, expectancyR: 0, profitFactor: null, maxDrawdownPct: 0, longTrades: 0, shortTrades: 0 }
  }
  const wins = trades.filter((t) => t.r > 0)
  const losses = trades.filter((t) => t.r <= 0)
  const grossWinR = wins.reduce((s, t) => s + t.r, 0)
  const grossLossR = Math.abs(losses.reduce((s, t) => s + t.r, 0))
  let equity = 1
  let peak = 1
  let maxDrawdownPct = 0
  for (const t of trades) {
    equity *= 1 + 0.0025 * t.r
    peak = Math.max(peak, equity)
    maxDrawdownPct = Math.max(maxDrawdownPct, ((peak - equity) / peak) * 100)
  }
  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct: wins.length / trades.length * 100,
    expectancyR: trades.reduce((s, t) => s + t.r, 0) / trades.length,
    profitFactor: grossLossR > 0 ? grossWinR / grossLossR : null,
    maxDrawdownPct,
    longTrades: trades.filter((t) => t.side === 'long').length,
    shortTrades: trades.filter((t) => t.side === 'short').length,
  }
}

function configWith(base, params) {
  return {
    ...base,
    strategy: {
      ...base.strategy,
      ...params,
      name: 'JARVIS_OPTIMIZER_CANDIDATE',
    },
  }
}

function candidateObjective(m, minTrades) {
  if (m.trades < minTrades) return -Infinity
  const pf = m.profitFactor == null ? 3 : Math.max(0.05, Math.min(3, m.profitFactor))
  const sampleBonus = Math.min(1, m.trades / Math.max(minTrades * 2, 24)) * 0.20
  return m.expectancyR * 2.5 + Math.log(pf) * 0.8 - m.maxDrawdownPct * 0.03 + sampleBonus
}

function makeCandidate(rand) {
  return {
    adxMin: pick(rand, [12, 15, 18, 21]),
    longSlopeMinPct: pick(rand, [0, 0.015, 0.03, 0.05]),
    shortSlopeMaxPct: pick(rand, [0, -0.015, -0.03, -0.05]),
    longRsiMin: pick(rand, [46, 48, 50]),
    longRsiMax: pick(rand, [64, 66, 68, 70]),
    shortRsiMin: pick(rand, [30, 32, 34, 36]),
    shortRsiMax: pick(rand, [48, 50, 52, 54]),
    breakoutVolumeRatio: pick(rand, [1.00, 1.10, 1.20, 1.30]),
    maxExtensionAtr: pick(rand, [1.0, 1.25, 1.5, 1.75]),
    maxTriggerBodyAtr: pick(rand, [0.9, 1.1, 1.3, 1.5]),
    swingLookback: pick(rand, [5, 8, 12]),
    swingBufferAtr: pick(rand, [0.10, 0.20, 0.30]),
    stopAtrFloorMult: pick(rand, [1.4, 1.7, 2.0, 2.3]),
    minStopPct: pick(rand, [0.7, 0.9, 1.1]),
    maxStopPct: pick(rand, [2.0, 2.5, 3.0]),
    pullbackRewardRisk: pick(rand, [1.6, 1.9, 2.2, 2.5]),
    breakoutRewardRisk: pick(rand, [1.5, 1.8, 2.1, 2.4]),
  }
}

function gateDiagnostics({ symbol, c4h, c1h, c15m, config, fromTs, toTs }) {
  const counts = { decisions: 0, volatility: 0, regime: 0, confirmation: 0, trigger: 0, eligible: 0 }
  for (let i = 219; i < c15m.length - 1; i += 1) {
    const decisionCandle = c15m[i]
    if (decisionCandle.ts < fromTs || decisionCandle.ts >= toTs) continue
    const decisionClose = decisionCandle.ts + intervalToMs('15')
    const s4h = lastClosedSlice(c4h, '240', decisionClose, 260)
    const s1h = lastClosedSlice(c1h, '60', decisionClose, 260)
    const s15m = c15m.slice(Math.max(0, i - 259), i + 1)
    if (s4h.length < 220 || s1h.length < 220 || s15m.length < 220) continue
    const signal = evaluateJarvisStrategySnapshot({ symbol, c4h: s4h, c1h: s1h, c15m: s15m, config })
    counts.decisions += 1
    if (signal.gates?.volatilityOk) counts.volatility += 1
    if (signal.gates?.long?.regime || signal.gates?.short?.regime) counts.regime += 1
    if (signal.gates?.long?.confirmation || signal.gates?.short?.confirmation) counts.confirmation += 1
    if ((signal.gates?.long?.trigger && signal.gates.long.trigger !== 'NONE') || (signal.gates?.short?.trigger && signal.gates.short.trigger !== 'NONE')) counts.trigger += 1
    if (signal.action !== 'WAIT') counts.eligible += 1
  }
  return counts
}

function backtestPeriod({ symbol, c4h, c1h, c15m, config, fromTs, toTs, feeBpsPerSide, slippageBpsPerSide }) {
  const trades = []
  for (let i = 219; i < c15m.length - 1; i += 1) {
    const decisionCandle = c15m[i]
    if (decisionCandle.ts < fromTs || decisionCandle.ts >= toTs) continue
    const decisionClose = decisionCandle.ts + intervalToMs('15')
    const s4h = lastClosedSlice(c4h, '240', decisionClose, 260)
    const s1h = lastClosedSlice(c1h, '60', decisionClose, 260)
    const s15m = c15m.slice(Math.max(0, i - 259), i + 1)
    if (s4h.length < 220 || s1h.length < 220 || s15m.length < 220) continue

    const signal = evaluateJarvisStrategySnapshot({ symbol, c4h: s4h, c1h: s1h, c15m: s15m, config })
    if (signal.action === 'WAIT') continue
    const trade = tradeExit({ signal, candles: c15m, entryIndex: i + 1, periodEnd: toTs, feeBpsPerSide, slippageBpsPerSide })
    if (!trade) continue
    trades.push(trade)
    i = Math.max(i, trade.exitIndex)
  }
  return { trades, metrics: metrics(trades) }
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2))
  const base = loadConfig()
  const symbol = String(args.symbol || 'BTC').toUpperCase()
  const days = finitePositive(args.days, 180, 'days')
  const warmupDays = finitePositive(args.warmupDays, base.strategyLab?.warmupDays ?? 40, 'warmupDays')
  const samples = Math.max(2, Math.floor(finitePositive(args.samples, 40, 'samples')))
  const minTrainTrades = Math.max(3, Math.floor(finitePositive(args.minTrainTrades, 8, 'minTrainTrades')))
  const feeBpsPerSide = finitePositive(args.feeBps, base.strategyLab?.feeBpsPerSide ?? 6, 'feeBps')
  const slippageBpsPerSide = finitePositive(args.slippageBps, base.strategyLab?.slippageBpsPerSide ?? 2, 'slippageBps')

  const endTs = Date.now()
  const startTs = endTs - days * DAY
  const splitTs = startTs + (endTs - startTs) * 0.70
  const historyStart = startTs - warmupDays * DAY

  console.log(`JARVIS Optimizer — ${symbol}, ${days} days, ${samples} train-only candidates`)
  console.log('Selection uses first 70% only. The final 30% stays frozen until one candidate is selected.')
  console.log('Downloading history once...')

  const [c4h, c1h, c15m] = await Promise.all([
    fetchHistoricalKlines(symbol, '240', historyStart, endTs, base),
    fetchHistoricalKlines(symbol, '60', historyStart, endTs, base),
    fetchHistoricalKlines(symbol, '15', historyStart, endTs, base),
  ])

  const baselineGates = gateDiagnostics({ symbol, c4h, c1h, c15m, config: base, fromTs: startTs, toTs: splitTs })
  console.log('\nBaseline gate diagnostics on TRAIN 70%:')
  console.table([{
    decisions: baselineGates.decisions,
    volatility: baselineGates.volatility,
    regime: baselineGates.regime,
    confirmation: baselineGates.confirmation,
    trigger: baselineGates.trigger,
    eligible: baselineGates.eligible,
  }])

  const rand = seededRandom()
  const candidates = [{ ...base.strategy }]
  const seen = new Set([JSON.stringify(candidates[0])])
  while (candidates.length < samples) {
    const p = makeCandidate(rand)
    const key = JSON.stringify(p)
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push(p)
  }

  const trainResults = []
  for (let i = 0; i < candidates.length; i += 1) {
    const cfg = configWith(base, candidates[i])
    const result = backtestPeriod({ symbol, c4h, c1h, c15m, config: cfg, fromTs: startTs, toTs: splitTs, feeBpsPerSide, slippageBpsPerSide })
    trainResults.push({ index: i, params: candidates[i], ...result.metrics, objective: candidateObjective(result.metrics, minTrainTrades) })
    if ((i + 1) % 10 === 0 || i + 1 === candidates.length) process.stdout.write(`\rTRAIN candidates tested: ${i + 1}/${candidates.length}`)
  }
  process.stdout.write('\n')

  const ranked = trainResults.filter((r) => Number.isFinite(r.objective)).sort((a, b) => b.objective - a.objective)
  if (!ranked.length) {
    console.log(`NO ELIGIBLE CANDIDATE: none produced at least ${minTrainTrades} TRAIN trades.`)
    console.log('Conclusion: the current trigger family is too restrictive; widen the architecture before tuning parameters.')
    process.exit(2)
  }

  console.log('\nTop TRAIN-only candidates:')
  console.table(ranked.slice(0, 8).map((r) => ({
    id: r.index,
    trades: r.trades,
    long: r.longTrades,
    short: r.shortTrades,
    winRate: pct(r.winRatePct),
    expectancyR: round(r.expectancyR, 3),
    profitFactor: round(r.profitFactor, 3),
    maxDD: pct(r.maxDrawdownPct),
    objective: round(r.objective, 3),
  })))

  const winner = ranked[0]
  const frozenConfig = configWith(base, winner.params)
  const oos = backtestPeriod({ symbol, c4h, c1h, c15m, config: frozenConfig, fromTs: splitTs, toTs: endTs, feeBpsPerSide, slippageBpsPerSide }).metrics

  const oosMinTrades = Math.max(3, Math.ceil(minTrainTrades * 0.3))
  const passed = winner.expectancyR > 0.05 && (winner.profitFactor ?? 0) > 1.10 && oos.trades >= oosMinTrades && oos.expectancyR > 0 && (oos.profitFactor ?? 0) > 1.0

  console.log('\nFrozen winner — TRAIN vs untouched OOS:')
  console.table([
    { scope: 'TRAIN 70%', trades: winner.trades, long: winner.longTrades, short: winner.shortTrades, winRate: pct(winner.winRatePct), expectancyR: round(winner.expectancyR, 3), profitFactor: round(winner.profitFactor, 3), maxDD: pct(winner.maxDrawdownPct) },
    { scope: 'OOS 30%', trades: oos.trades, long: oos.longTrades, short: oos.shortTrades, winRate: pct(oos.winRatePct), expectancyR: round(oos.expectancyR, 3), profitFactor: round(oos.profitFactor, 3), maxDD: pct(oos.maxDrawdownPct) },
  ])
  console.log(`\nRESEARCH GATE: ${passed ? 'PASS' : 'REJECT'}`)
  console.log('PASS is not permission for live trading. It only means the candidate survived this train/OOS test.')

  const report = {
    engine: 'JARVIS_TRAIN_OOS_OPTIMIZER_V1',
    symbol,
    period: { days, from: new Date(startTs).toISOString(), split: new Date(splitTs).toISOString(), to: new Date(endTs).toISOString() },
    assumptions: { selection: 'first 70% only', oos: 'final 30% untouched until winner selected', feeBpsPerSide, slippageBpsPerSide, minTrainTrades, samples },
    baselineGates,
    topTrain: ranked.slice(0, 8),
    selectedParams: winner.params,
    selectedTrain: winner,
    frozenOos: oos,
    researchGate: passed ? 'PASS' : 'REJECT',
    generatedAt: new Date().toISOString(),
  }
  const outPath = join(here, `optimizer-${symbol.toLowerCase()}-${Math.round(days)}d.json`)
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8')
  console.log(`Report saved: ${outPath}`)
  console.log('Research only. This command cannot submit an order.')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
