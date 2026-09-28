import { loadConfig } from './trader-lib.mjs'
import { bybitPublicGet, normalizeBybitSymbol } from './bybit-demo-lib.mjs'

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

function sma(values, period) {
  if (values.length < period) return NaN
  let sum = 0
  for (let i = values.length - period; i < values.length; i += 1) sum += values[i]
  return sum / period
}

function emaSeries(values, period) {
  if (values.length < period) return []
  const k = 2 / (period + 1)
  const out = new Array(values.length).fill(NaN)
  let seed = 0
  for (let i = 0; i < period; i += 1) seed += values[i]
  let prev = seed / period
  out[period - 1] = prev
  for (let i = period; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

function rsi(values, period = 14) {
  if (values.length < period + 1) return NaN
  let gain = 0
  let loss = 0
  for (let i = values.length - period; i < values.length; i += 1) {
    const d = values[i] - values[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  if (loss === 0) return 100
  const rs = (gain / period) / (loss / period)
  return 100 - 100 / (1 + rs)
}

function trueRanges(candles) {
  const out = []
  for (let i = 1; i < candles.length; i += 1) {
    const h = candles[i].high
    const l = candles[i].low
    const pc = candles[i - 1].close
    out.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
  }
  return out
}

function atr(candles, period = 14) {
  return sma(trueRanges(candles), period)
}

function macdHistogram(values) {
  const fast = emaSeries(values, 12)
  const slow = emaSeries(values, 26)
  const macd = values.map((_, i) => Number.isFinite(fast[i]) && Number.isFinite(slow[i]) ? fast[i] - slow[i] : NaN)
  const clean = macd.filter(Number.isFinite)
  if (clean.length < 9) return NaN
  const signal = emaSeries(clean, 9)
  return clean.at(-1) - signal.at(-1)
}

function adx(candles, period = 14) {
  if (candles.length < period * 2 + 2) return NaN
  const tr = []
  const plusDM = []
  const minusDM = []
  for (let i = 1; i < candles.length; i += 1) {
    const up = candles[i].high - candles[i - 1].high
    const down = candles[i - 1].low - candles[i].low
    plusDM.push(up > down && up > 0 ? up : 0)
    minusDM.push(down > up && down > 0 ? down : 0)
    tr.push(Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close),
    ))
  }
  const dx = []
  for (let end = period; end <= tr.length; end += 1) {
    const trN = tr.slice(end - period, end).reduce((a, b) => a + b, 0)
    const pN = plusDM.slice(end - period, end).reduce((a, b) => a + b, 0)
    const mN = minusDM.slice(end - period, end).reduce((a, b) => a + b, 0)
    if (trN <= 0) continue
    const pdi = 100 * pN / trN
    const mdi = 100 * mN / trN
    const denom = pdi + mdi
    if (denom > 0) dx.push(100 * Math.abs(pdi - mdi) / denom)
  }
  return sma(dx, period)
}

function volumeRatio(candles, period = 20) {
  const volumes = candles.map((c) => c.volume)
  const base = sma(volumes.slice(0, -1), period)
  if (!Number.isFinite(base) || base <= 0) return NaN
  return volumes.at(-1) / base
}

function slopePct(series, lookback = 5) {
  if (series.length < lookback + 1) return NaN
  const now = series.at(-1)
  const prev = series.at(-(lookback + 1))
  if (!Number.isFinite(now) || !Number.isFinite(prev) || prev === 0) return NaN
  return ((now - prev) / prev) * 100
}

export function intervalToMs(interval) {
  const value = String(interval)
  const map = {
    '1': 60_000,
    '3': 3 * 60_000,
    '5': 5 * 60_000,
    '15': 15 * 60_000,
    '30': 30 * 60_000,
    '60': 60 * 60_000,
    '120': 2 * 60 * 60_000,
    '240': 4 * 60 * 60_000,
    '360': 6 * 60 * 60_000,
    '720': 12 * 60 * 60_000,
    D: 24 * 60 * 60_000,
  }
  if (!map[value]) throw new Error(`Unsupported interval: ${interval}`)
  return map[value]
}

export function candlesFromBybit(list) {
  return [...list]
    .map((r) => ({
      ts: Number(r[0]),
      open: num(r[1]),
      high: num(r[2]),
      low: num(r[3]),
      close: num(r[4]),
      volume: num(r[5]),
    }))
    .filter((c) => [c.ts, c.open, c.high, c.low, c.close, c.volume].every(Number.isFinite))
    .sort((a, b) => a.ts - b.ts)
}

export function closedCandlesOnly(candles, interval, now = Date.now()) {
  const ms = intervalToMs(interval)
  return candles.filter((c) => c.ts + ms <= now)
}

export async function fetchStrategyKlines(symbol, interval, limit, config = loadConfig(), end = undefined) {
  const fullSymbol = normalizeBybitSymbol(symbol, config)
  const params = {
    category: config.bybitDemo.category,
    symbol: fullSymbol,
    interval,
    limit,
  }
  if (end !== undefined) params.end = end
  const data = await bybitPublicGet('/v5/market/kline', params, config)
  const rows = data.result?.list
  if (!Array.isArray(rows)) throw new Error(`No ${interval} kline data for ${fullSymbol}`)
  return candlesFromBybit(rows)
}

export function timeframeStats(candles) {
  const closes = candles.map((c) => c.close)
  const ema20s = emaSeries(closes, 20)
  const ema50s = emaSeries(closes, 50)
  const ema200s = emaSeries(closes, 200)
  const last = candles.at(-1)
  const prev = candles.at(-2)
  const atr14 = atr(candles, 14)
  return {
    price: last.close,
    open: last.open,
    prevClose: prev.close,
    ema20: ema20s.at(-1),
    ema50: ema50s.at(-1),
    ema200: ema200s.at(-1),
    ema50SlopePct: slopePct(ema50s.filter(Number.isFinite), 5),
    rsi14: rsi(closes, 14),
    macdHist: macdHistogram(closes),
    atr14,
    atrPct: atr14 / last.close * 100,
    adx14: adx(candles, 14),
    volumeRatio20: volumeRatio(candles, 20),
    high20: Math.max(...candles.slice(-21, -1).map((c) => c.high)),
    low20: Math.min(...candles.slice(-21, -1).map((c) => c.low)),
    bullishCandle: last.close > last.open && last.close > prev.close,
    bearishCandle: last.close < last.open && last.close < prev.close,
    distanceFromEma20Atr: atr14 > 0 ? Math.abs(last.close - ema20s.at(-1)) / atr14 : NaN,
  }
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}

function scoreV2({ side, regime, confirmation, trigger, t4, t1, t15, cfg }) {
  let score = 0
  const reasons = []
  const add = (points, reason) => {
    score += points
    reasons.push(`+${points}: ${reason}`)
  }

  if (regime) add(35, `4H ${side} regime aligned`)
  if (confirmation) add(30, `1H ${side} confirmation aligned`)
  if (trigger.pullback) add(20, '15m pullback trigger')
  if (trigger.breakout) add(20, '15m breakout trigger')
  if (t4.adx14 >= Number(cfg.adxStrong ?? 25)) add(5, `4H ADX ${t4.adx14.toFixed(1)} strong`)
  if (t15.volumeRatio20 >= Number(cfg.breakoutVolumeRatio ?? 1.2)) add(5, `15m volume x${t15.volumeRatio20.toFixed(2)}`)
  if (side === 'long' && t1.rsi14 >= 52 && t1.rsi14 <= 64) add(5, `1H RSI ${t1.rsi14.toFixed(1)} in long sweet spot`)
  if (side === 'short' && t1.rsi14 <= 48 && t1.rsi14 >= 36) add(5, `1H RSI ${t1.rsi14.toFixed(1)} in short sweet spot`)

  return { score: Math.min(score, 100), reasons }
}

export function evaluateJarvisStrategySnapshot({ symbol = 'BTC', c4h, c1h, c15m, config = loadConfig() }) {
  if (c4h.length < 220 || c1h.length < 220 || c15m.length < 220) {
    throw new Error('JARVIS strategy requires at least 220 closed candles on 4H, 1H and 15m')
  }

  const cfg = config.strategy || {}
  const t4 = timeframeStats(c4h)
  const t1 = timeframeStats(c1h)
  const t15 = timeframeStats(c15m)

  const adxMin = Number(cfg.adxMin ?? 20)
  const slopeMin = Number(cfg.ema50SlopeMinPct ?? 0.05)
  const minAtrPct = Number(cfg.minAtrPct ?? 0.25)
  const maxAtrPct = Number(cfg.maxAtrPct ?? 4.0)
  const pullbackAtr = Number(cfg.pullbackAtrDistance ?? 0.55)
  const breakoutVolumeRatio = Number(cfg.breakoutVolumeRatio ?? 1.2)
  const longThreshold = Number(cfg.longScoreThreshold ?? 85)
  const shortThreshold = Number(cfg.shortScoreThreshold ?? 80)

  const volatilityOk = t15.atrPct >= minAtrPct && t15.atrPct <= maxAtrPct

  const longRegime =
    t4.price > t4.ema50 &&
    t4.ema50 > t4.ema200 &&
    t4.ema50SlopePct >= slopeMin &&
    t4.adx14 >= adxMin

  const shortRegime =
    t4.price < t4.ema50 &&
    t4.ema50 < t4.ema200 &&
    t4.ema50SlopePct <= -slopeMin &&
    t4.adx14 >= adxMin

  const longConfirmation =
    t1.ema20 > t1.ema50 &&
    t1.price > t1.ema20 &&
    t1.macdHist > 0 &&
    t1.rsi14 >= Number(cfg.longRsiMin ?? 50) &&
    t1.rsi14 <= Number(cfg.longRsiMax ?? 68)

  const shortConfirmation =
    t1.ema20 < t1.ema50 &&
    t1.price < t1.ema20 &&
    t1.macdHist < 0 &&
    t1.rsi14 <= Number(cfg.shortRsiMax ?? 50) &&
    t1.rsi14 >= Number(cfg.shortRsiMin ?? 32)

  const longPullback =
    t15.distanceFromEma20Atr <= pullbackAtr &&
    t15.price >= t15.ema20 &&
    t15.macdHist > 0 &&
    t15.bullishCandle

  const shortPullback =
    t15.distanceFromEma20Atr <= pullbackAtr &&
    t15.price <= t15.ema20 &&
    t15.macdHist < 0 &&
    t15.bearishCandle

  const longBreakout =
    t15.price > t15.high20 &&
    t15.volumeRatio20 >= breakoutVolumeRatio &&
    t15.macdHist > 0 &&
    t15.bullishCandle

  const shortBreakout =
    t15.price < t15.low20 &&
    t15.volumeRatio20 >= breakoutVolumeRatio &&
    t15.macdHist < 0 &&
    t15.bearishCandle

  const longTrigger = { pullback: longPullback, breakout: longBreakout }
  const shortTrigger = { pullback: shortPullback, breakout: shortBreakout }
  const longScore = scoreV2({ side: 'long', regime: longRegime, confirmation: longConfirmation, trigger: longTrigger, t4, t1, t15, cfg })
  const shortScore = scoreV2({ side: 'short', regime: shortRegime, confirmation: shortConfirmation, trigger: shortTrigger, t4, t1, t15, cfg })

  const longHardBlocks = []
  const shortHardBlocks = []
  if (!volatilityOk) {
    longHardBlocks.push(`ATR ${t15.atrPct.toFixed(2)}% outside ${minAtrPct}-${maxAtrPct}% band`)
    shortHardBlocks.push(`ATR ${t15.atrPct.toFixed(2)}% outside ${minAtrPct}-${maxAtrPct}% band`)
  }
  if (!longRegime) longHardBlocks.push('4H long regime not fully aligned')
  if (!shortRegime) shortHardBlocks.push('4H short regime not fully aligned')
  if (!longConfirmation) longHardBlocks.push('1H long confirmation not fully aligned')
  if (!shortConfirmation) shortHardBlocks.push('1H short confirmation not fully aligned')
  if (!longPullback && !longBreakout) longHardBlocks.push('no explicit 15m long trigger')
  if (!shortPullback && !shortBreakout) shortHardBlocks.push('no explicit 15m short trigger')

  const longEligible = longHardBlocks.length === 0 && longScore.score >= longThreshold
  const shortEligible = shortHardBlocks.length === 0 && shortScore.score >= shortThreshold

  let selectedSide = 'none'
  let action = 'WAIT'
  if (longEligible && !shortEligible) {
    selectedSide = 'long'
    action = 'LONG'
  } else if (shortEligible && !longEligible) {
    selectedSide = 'short'
    action = 'SHORT'
  } else if (longEligible && shortEligible) {
    selectedSide = longScore.score >= shortScore.score ? 'long' : 'short'
    action = selectedSide.toUpperCase()
  }

  const chosen = selectedSide === 'short' ? shortScore : longScore
  const chosenBlocks = selectedSide === 'short' ? shortHardBlocks : selectedSide === 'long' ? longHardBlocks : [...new Set([...longHardBlocks, ...shortHardBlocks])]

  const stopAtrMult = Number(cfg.stopAtrMult ?? 1.8)
  const rr = Number(cfg.rewardRisk ?? 2.2)
  const stopPct = clamp(
    (t15.atr14 * stopAtrMult / t15.price) * 100,
    Number(cfg.minStopPct ?? 0.85),
    Number(cfg.maxStopPct ?? 2.5),
  )
  const takePct = stopPct * rr

  return {
    strategy: 'JARVIS_ORIGINAL_MTF_V2',
    symbol: normalizeBybitSymbol(symbol, config),
    action,
    selectedSide,
    score: action === 'WAIT' ? Math.max(longScore.score, shortScore.score) : chosen.score,
    rawScores: { long: longScore.score, short: shortScore.score },
    thresholds: { long: longThreshold, short: shortThreshold },
    stopPct,
    takePct,
    rewardRisk: rr,
    hardBlocks: chosenBlocks,
    reasons: action === 'WAIT' ? [] : chosen.reasons,
    gates: {
      volatilityOk,
      long: { regime: longRegime, confirmation: longConfirmation, trigger: longTrigger, eligible: longEligible },
      short: { regime: shortRegime, confirmation: shortConfirmation, trigger: shortTrigger, eligible: shortEligible },
    },
    market: { '4h': t4, '1h': t1, '15m': t15 },
    rules: {
      noAveragingDown: true,
      maxOpenPositions: config.risk.maxOpenPositions,
      leverage: config.risk.maxLeverage,
      execution: 'SIGNAL_ONLY',
      closedCandlesOnly: true,
      explicit15mTriggerRequired: true,
      strict4h1hAlignment: true,
    },
    generatedAt: new Date().toISOString(),
  }
}

export async function evaluateJarvisStrategy(symbol = 'BTC', config = loadConfig()) {
  const now = Date.now()
  const [raw4h, raw1h, raw15m] = await Promise.all([
    fetchStrategyKlines(symbol, '240', 300, config),
    fetchStrategyKlines(symbol, '60', 300, config),
    fetchStrategyKlines(symbol, '15', 300, config),
  ])
  const c4h = closedCandlesOnly(raw4h, '240', now).slice(-260)
  const c1h = closedCandlesOnly(raw1h, '60', now).slice(-260)
  const c15m = closedCandlesOnly(raw15m, '15', now).slice(-260)
  return evaluateJarvisStrategySnapshot({ symbol, c4h, c1h, c15m, config })
}
