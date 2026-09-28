import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

export function loadConfig() {
  return JSON.parse(readFileSync(join(here, 'trader.config.json'), 'utf8'))
}

export async function fetchAllMids(config = loadConfig()) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(config.marketData.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Hyperliquid HTTP ${response.status}`)
    const data = await response.json()
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Unexpected Hyperliquid allMids response')
    }
    return data
  } finally {
    clearTimeout(timeout)
  }
}

export function parseCliArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const raw = arg.slice(2)
    if (raw.includes('=')) {
      const [key, ...rest] = raw.split('=')
      out[key] = rest.join('=')
    } else {
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        out[raw] = next
        i += 1
      } else {
        out[raw] = true
      }
    }
  }
  return out
}

function finitePositive(value, name) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be > 0`)
  return n
}

export function buildPaperTrade({ config, symbol, side, price, stopPct, takePct, equity }) {
  if (config.mode !== 'paper') throw new Error(`Refusing to simulate: mode=${config.mode}`)

  const cleanSymbol = String(symbol || '').toUpperCase()
  if (!config.marketData.symbols.includes(cleanSymbol)) {
    throw new Error(`Symbol ${cleanSymbol || '(empty)'} is not allowed`)
  }

  const cleanSide = String(side || '').toLowerCase()
  if (!['long', 'short'].includes(cleanSide)) throw new Error('side must be long or short')

  const px = finitePositive(price, 'price')
  const stop = finitePositive(stopPct, 'stopPct')
  const take = finitePositive(takePct, 'takePct')
  const accountEquity = finitePositive(equity ?? config.paper.startingEquity, 'equity')

  const risk = config.risk
  if (risk.requireStopLoss && !stop) throw new Error('Stop loss is required')
  if (risk.requireTakeProfit && !take) throw new Error('Take profit is required')
  if (risk.maxLeverage !== 1) throw new Error('v0.1 is hard-locked to 1x leverage')

  const maxRiskUsd = accountEquity * (risk.maxRiskPerTradePct / 100)
  const notionalFromRisk = maxRiskUsd / (stop / 100)
  const maxNotional = accountEquity * (risk.maxPositionPct / 100)
  const notional = Math.min(notionalFromRisk, maxNotional)
  const quantity = notional / px

  const stopPrice = cleanSide === 'long' ? px * (1 - stop / 100) : px * (1 + stop / 100)
  const takePrice = cleanSide === 'long' ? px * (1 + take / 100) : px * (1 - take / 100)
  const worstCaseLoss = notional * (stop / 100)
  const targetProfit = notional * (take / 100)

  if (worstCaseLoss > maxRiskUsd + 1e-9) throw new Error('Risk guard rejected trade: max risk exceeded')
  if (notional > maxNotional + 1e-9) throw new Error('Risk guard rejected trade: max position exceeded')

  return {
    mode: 'paper',
    execution: 'DISABLED',
    symbol: cleanSymbol,
    side: cleanSide,
    entryPrice: px,
    stopPrice,
    takePrice,
    stopPct: stop,
    takePct: take,
    quantity,
    notional,
    equity: accountEquity,
    worstCaseLoss,
    targetProfit,
    riskPctOfEquity: (worstCaseLoss / accountEquity) * 100,
    leverage: 1,
    generatedAt: new Date().toISOString(),
  }
}
