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

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
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

function timeframeStats(candles) {
  const closes = candles.map((c) => c.close)
  const ema20s = emaSeries(closes, 20)
  const ema50s = emaSeries(closes, 50)
  const ema200s = emaSeries(closes, 200)
  const last = candles.at(-1)
  const prev = candles.at(-2)
  const atr14 = atr(candles, 14)
  const body = Math.abs(last.close - last.open)
  const range = Math.max(0, last.high - last.low)
  return {
    price: last.close,
    open: last.open,
    prevClose: prev.close,
    ema20: ema20s.at(-1),
    ema20Prev: ema20s.at(-2),
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
    bodyAtr: atr14 > 0 ? body / atr14 : NaN,
    rangeAtr: atr14 > 0 ? range / atr14 : NaN,
  }
}

function structuralStopPct({ side, candles, atr14, price, cfg }) {
  const lookback = Math.max(3, Number(cfg.swingLookback ?? 8))
  const bufferAtr = Number(cfg.swingBufferAtr ?? 0.20)
  const recent = candles.slice(-lookback)
  let pct
  if (side === 'long') {
    const swing = Math.min(...recent.map((c) => c.low)) - atr14 * bufferAtr
    pct = ((price - swing) / price) * 100
  } else {
    const swing = Math.max(...recent.map((c) => c.high)) + atr14 * bufferAtr
    pct = ((swing - price) / price) * 100
  }
  const atrFloor = (atr14 * Number(cfg.stopAtrFloorMult ?? 2.0) / price) * 100
  return clamp(
    Math.max(pct, atrFloor),
    Number(cfg.minStopPct ?? 1.0),
    Number(cfg.maxStopPct ?? 2.8),
  )
}

export function evaluateJarvisStrategySnapshot({ symbol = 'BTC', c4h, c1h, c15m, config = loadConfig() }) {
  if (c4h.length < 220 || c1h.length < 220 || c15m.length < 220) {
    throw new Error('JARVIS strategy requires at least 220 closed candles on 4H, 1H and 15m')
  }

  const cfg = config.strategy || {}
  const t4 = timeframeStats(c4h)
  const t1 = timeframeStats(c1h)
  const t15 = timeframeStats(c15m)

  const adxMin = Number(cfg.adxMin ?? 18)
  const longSlopeMin = Number(cfg.longSlopeMinPct ?? 0.03)
  const shortSlopeMax = Number(cfg.shortSlopeMaxPct ?? -0.03)
  const minAtrPct = Number(cfg.minAtrPct ?? 0.20)
  const maxAtrPct = Number(cfg.maxAtrPct ?? 4.0)
  const maxExtensionAtr = Number(cfg.maxExtensionAtr ?? 1.15)
  const maxTriggerBodyAtr = Number(cfg.maxTriggerBodyAtr ?? 1.10)
  const breakoutVolumeRatio = Number(cfg.breakoutVolumeRatio ?? 1.25)
  const volatilityOk = t15.atrPct >= minAtrPct && t15.atrPct <= maxAtrPct

  // V3 is intentionally asymmetric. Longs demand a full 4H bull structure.
  const longRegime =
    t4.price > t4.ema50 &&
    t4.ema50 > t4.ema200 &&
    t4.ema50SlopePct >= longSlopeMin &&
    t4.adx14 >= adxMin

  // Shorts are allowed earlier in a falling regime: BTC can sell off before EMA50 crosses EMA200.
  const shortRegime =
    t4.price < t4.ema50 &&
    t4.ema50SlopePct <= shortSlopeMax &&
    t4.adx14 >= adxMin

  const longConfirmation =
    t1.price > t1.ema50 &&
    t1.ema20 > t1.ema50 &&
    t1.macdHist > 0 &&
    t1.rsi14 >= Number(cfg.longRsiMin ?? 50) &&
    t1.rsi14 <= Number(cfg.longRsiMax ?? 66)

  const shortConfirmation =
    t1.price < t1.ema50 &&
    t1.ema20 < t1.ema50 &&
    t1.macdHist < 0 &&
    t1.rsi14 >= Number(cfg.shortRsiMin ?? 34) &&
    t1.rsi14 <= Number(cfg.shortRsiMax ?? 50)

  // Pullback means an actual EMA20 reclaim/rejection, not merely "near EMA20".
  const longReclaim =
    t15.prevClose <= t15.ema20Prev &&
    t15.price > t15.ema20 &&
    t15.bullishCandle &&
    t15.macdHist > 0 &&
    t15.bodyAtr <= maxTriggerBodyAtr

  const shortReject =
    t15.prevClose >= t15.ema20Prev &&
    t15.price < t15.ema20 &&
    t15.bearishCandle &&
    t15.macdHist < 0 &&
    t15.bodyAtr <= maxTriggerBodyAtr

  // Breakouts are accepted only if they are not already too extended from EMA20.
  const longBreakout =
    t15.price > t15.high20 &&
    t15.volumeRatio20 >= breakoutVolumeRatio &&
    t15.macdHist > 0 &&
    t15.bullishCandle &&
    t15.distanceFromEma20Atr <= maxExtensionAtr &&
    t15.rangeAtr <= Number(cfg.maxBreakoutRangeAtr ?? 1.8)

  const shortBreakout =
    t15.price < t15.low20 &&
    t15.volumeRatio20 >= breakoutVolumeRatio &&
    t15.macdHist < 0 &&
    t15.bearishCandle &&
    t15.distanceFromEma20Atr <= maxExtensionAtr &&
    t15.rangeAtr <= Number(cfg.maxBreakoutRangeAtr ?? 1.8)

  const longTrigger = longReclaim ? 'RECLAIM' : longBreakout ? 'BREAKOUT' : 'NONE'
  const shortTrigger = shortReject ? 'REJECT' : shortBreakout ? 'BREAKDOWN' : 'NONE'

  const longEligible = volatilityOk && longRegime && longConfirmation && longTrigger !== 'NONE'
  const shortEligible = volatilityOk && shortRegime && shortConfirmation && shortTrigger !== 'NONE'

  let action = 'WAIT'
  let selectedSide = 'none'
  let trigger = 'NONE'

  if (longEligible && !shortEligible) {
    action = 'LONG'
    selectedSide = 'long'
    trigger = longTrigger
  } else if (shortEligible && !longEligible) {
    action = 'SHORT'
    selectedSide = 'short'
    trigger = shortTrigger
  } else if (longEligible && shortEligible) {
    // Ambiguous regime: no trade. V3 does not guess.
    action = 'WAIT'
  }

  const sideForStop = selectedSide === 'short' ? 'short' : 'long'
  const stopPct = structuralStopPct({ side: sideForStop, candles: c15m, atr14: t15.atr14, price: t15.price, cfg })
  const rr = trigger === 'BREAKOUT' || trigger === 'BREAKDOWN'
    ? Number(cfg.breakoutRewardRisk ?? 2.0)
    : Number(cfg.pullbackRewardRisk ?? 2.3)
  const takePct = stopPct * rr

  let score = 0
  const reasons = []
  if (action !== 'WAIT') {
    score = 70
    reasons.push(`4H ${selectedSide} regime aligned`)
    reasons.push(`1H ${selectedSide} confirmation aligned`)
    reasons.push(`15m ${trigger.toLowerCase()} trigger`)
    if (t4.adx14 >= 25) score += 10
    if (t15.volumeRatio20 >= breakoutVolumeRatio) score += 10
    if (t15.distanceFromEma20Atr <= 0.5) score += 10
    score = Math.min(score, 100)
  }

  const hardBlocks = []
  if (!volatilityOk) hardBlocks.push('15m volatility outside configured band')
  if (action === 'WAIT') {
    if (!longRegime && !shortRegime) hardBlocks.push('no 4H directional regime')
    if (!longConfirmation && !shortConfirmation) hardBlocks.push('no 1H directional confirmation')
    if (longTrigger === 'NONE' && shortTrigger === 'NONE') hardBlocks.push('no 15m reclaim/reject/breakout trigger')
  }

  return {
    strategy: 'JARVIS_ORIGINAL_MTF_V3',
    symbol: normalizeBybitSymbol(symbol, config),
    action,
    selectedSide,
    trigger,
    score,
    stopPct,
    takePct,
    rewardRisk: rr,
    hardBlocks,
    reasons,
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
      asymmetricLongShort: true,
      structuralStops: true,
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
