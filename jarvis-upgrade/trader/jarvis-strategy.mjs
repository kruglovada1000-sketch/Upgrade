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
  const atr14 = atr(candles, 14)
  return {
    price: last.close,
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
  }
}

function addScore(state, points, reason) {
  state.score += points
  state.reasons.push(`${points > 0 ? '+' : ''}${points}: ${reason}`)
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}

export function evaluateJarvisStrategySnapshot({ symbol = 'BTC', c4h, c1h, c15m, config = loadConfig() }) {
  if (c4h.length < 220 || c1h.length < 220 || c15m.length < 220) {
    throw new Error('JARVIS strategy requires at least 220 closed candles on 4H, 1H and 15m')
  }

  const sCfg = config.strategy || {}
  const t4 = timeframeStats(c4h)
  const t1 = timeframeStats(c1h)
  const t15 = timeframeStats(c15m)
  const long = { side: 'long', score: 0, reasons: [] }
  const short = { side: 'short', score: 0, reasons: [] }

  const adxMin = Number(sCfg.adxMin ?? 18)
  const minAtrPct = Number(sCfg.minAtrPct ?? 0.25)
  const maxAtrPct = Number(sCfg.maxAtrPct ?? 4.0)
  const scoreThreshold = Number(sCfg.scoreThreshold ?? 72)

  if (t4.price > t4.ema200 && t4.ema50 > t4.ema200) addScore(long, 18, '4H structure above EMA200')
  if (t4.price < t4.ema200 && t4.ema50 < t4.ema200) addScore(short, 18, '4H structure below EMA200')
  if (t4.ema50SlopePct > 0.15) addScore(long, 10, '4H EMA50 slope rising')
  if (t4.ema50SlopePct < -0.15) addScore(short, 10, '4H EMA50 slope falling')
  if (t4.adx14 >= adxMin) {
    if (t4.price > t4.ema50) addScore(long, 7, `4H ADX ${t4.adx14.toFixed(1)} confirms trend`)
    if (t4.price < t4.ema50) addScore(short, 7, `4H ADX ${t4.adx14.toFixed(1)} confirms trend`)
  }

  if (t1.ema20 > t1.ema50 && t1.price > t1.ema20) addScore(long, 15, '1H EMA20 > EMA50 and price above EMA20')
  if (t1.ema20 < t1.ema50 && t1.price < t1.ema20) addScore(short, 15, '1H EMA20 < EMA50 and price below EMA20')
  if (t1.macdHist > 0) addScore(long, 8, '1H MACD histogram positive')
  if (t1.macdHist < 0) addScore(short, 8, '1H MACD histogram negative')
  if (t1.rsi14 >= 48 && t1.rsi14 <= 68) addScore(long, 7, `1H RSI ${t1.rsi14.toFixed(1)} constructive, not overheated`)
  if (t1.rsi14 <= 52 && t1.rsi14 >= 32) addScore(short, 7, `1H RSI ${t1.rsi14.toFixed(1)} constructive for short, not exhausted`)

  const longPullback = t15.price >= t15.ema20 - t15.atr14 * 0.35 && t15.price <= t15.ema20 + t15.atr14 * 0.80
  const shortPullback = t15.price <= t15.ema20 + t15.atr14 * 0.35 && t15.price >= t15.ema20 - t15.atr14 * 0.80
  if (longPullback && t15.macdHist > 0) addScore(long, 12, '15m controlled pullback with positive momentum')
  if (shortPullback && t15.macdHist < 0) addScore(short, 12, '15m controlled pullback with negative momentum')
  if (t15.price > t15.high20) addScore(long, 8, '15m 20-bar breakout')
  if (t15.price < t15.low20) addScore(short, 8, '15m 20-bar breakdown')
  if (t15.volumeRatio20 >= 1.05) {
    if (t15.price >= t15.ema20) addScore(long, 5, `15m volume confirmation x${t15.volumeRatio20.toFixed(2)}`)
    if (t15.price <= t15.ema20) addScore(short, 5, `15m volume confirmation x${t15.volumeRatio20.toFixed(2)}`)
  }

  const volatilityOk = t15.atrPct >= minAtrPct && t15.atrPct <= maxAtrPct
  if (volatilityOk) {
    addScore(long, 5, `15m ATR ${t15.atrPct.toFixed(2)}% inside tradable band`)
    addScore(short, 5, `15m ATR ${t15.atrPct.toFixed(2)}% inside tradable band`)
  }

  const winner = long.score >= short.score ? long : short
  const loser = winner === long ? short : long
  const scoreGap = winner.score - loser.score
  const conflictPenalty = scoreGap < 12 ? 10 : 0
  const finalScore = winner.score - conflictPenalty

  const hardBlocks = []
  if (!volatilityOk) hardBlocks.push(`ATR ${t15.atrPct.toFixed(2)}% outside ${minAtrPct}-${maxAtrPct}% band`)
  if (t4.adx14 < adxMin && Math.abs(t4.ema50SlopePct) < 0.1) hardBlocks.push('4H market is weak/sideways')
  if (winner.side === 'long' && t1.rsi14 > 74) hardBlocks.push('1H RSI too overbought for new long')
  if (winner.side === 'short' && t1.rsi14 < 26) hardBlocks.push('1H RSI too oversold for new short')

  const action = hardBlocks.length === 0 && finalScore >= scoreThreshold ? winner.side.toUpperCase() : 'WAIT'
  const stopAtrMult = Number(sCfg.stopAtrMult ?? 1.6)
  const rr = Number(sCfg.rewardRisk ?? 2.2)
  const stopPct = clamp((t15.atr14 * stopAtrMult / t15.price) * 100, Number(sCfg.minStopPct ?? 0.6), Number(sCfg.maxStopPct ?? 2.2))
  const takePct = stopPct * rr

  return {
    strategy: 'JARVIS_ORIGINAL_MTF_V1',
    symbol: normalizeBybitSymbol(symbol, config),
    action,
    selectedSide: winner.side,
    score: finalScore,
    rawScores: { long: long.score, short: short.score, gap: scoreGap, conflictPenalty },
    threshold: scoreThreshold,
    stopPct,
    takePct,
    rewardRisk: rr,
    hardBlocks,
    reasons: winner.reasons,
    market: { '4h': t4, '1h': t1, '15m': t15 },
    rules: {
      noAveragingDown: true,
      maxOpenPositions: config.risk.maxOpenPositions,
      leverage: config.risk.maxLeverage,
      execution: 'SIGNAL_ONLY',
      closedCandlesOnly: true,
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
