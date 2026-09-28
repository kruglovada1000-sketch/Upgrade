import { createHmac } from 'node:crypto'
import { loadConfig } from './trader-lib.mjs'

const HARD_CODED_TESTNET_BASE = 'https://api-testnet.bybit.com'

function bybitConfig(config = loadConfig()) {
  const cfg = config.bybitTestnet
  if (!cfg) throw new Error('Missing bybitTestnet config')
  if (cfg.baseUrl !== HARD_CODED_TESTNET_BASE) {
    throw new Error(`Refusing non-testnet Bybit endpoint: ${cfg.baseUrl}`)
  }
  return cfg
}

function timeoutSignal(ms = 10000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, clear: () => clearTimeout(timeout) }
}

function queryString(params = {}) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    query.append(key, String(value))
  }
  return query.toString()
}

function ensureBybitSuccess(data, context) {
  if (!data || typeof data !== 'object') throw new Error(`${context}: invalid JSON response`)
  if (Number(data.retCode) !== 0) {
    throw new Error(`${context}: Bybit retCode=${data.retCode} retMsg=${data.retMsg || '(empty)'}`)
  }
  return data
}

export function bybitCredentialsFromEnv() {
  const apiKey = process.env.BYBIT_TESTNET_API_KEY?.trim()
  const apiSecret = process.env.BYBIT_TESTNET_API_SECRET?.trim()
  if (!apiKey || !apiSecret) {
    throw new Error('Set BYBIT_TESTNET_API_KEY and BYBIT_TESTNET_API_SECRET in local environment')
  }
  return { apiKey, apiSecret }
}

export async function bybitPublicGet(path, params = {}, config = loadConfig()) {
  const cfg = bybitConfig(config)
  const qs = queryString(params)
  const url = `${cfg.baseUrl}${path}${qs ? `?${qs}` : ''}`
  const timer = timeoutSignal()
  try {
    const response = await fetch(url, { signal: timer.signal })
    if (!response.ok) throw new Error(`Bybit testnet HTTP ${response.status}`)
    return ensureBybitSuccess(await response.json(), `GET ${path}`)
  } finally {
    timer.clear()
  }
}

export async function bybitSignedRequest(method, path, { query = {}, body = null, config = loadConfig() } = {}) {
  const cfg = bybitConfig(config)
  const { apiKey, apiSecret } = bybitCredentialsFromEnv()
  const recvWindow = Number(cfg.recvWindow || 5000)
  const timestamp = Date.now().toString()
  const upperMethod = String(method).toUpperCase()
  const qs = queryString(query)
  const bodyString = body ? JSON.stringify(body) : ''
  const payload = upperMethod === 'GET'
    ? `${timestamp}${apiKey}${recvWindow}${qs}`
    : `${timestamp}${apiKey}${recvWindow}${bodyString}`
  const signature = createHmac('sha256', apiSecret).update(payload).digest('hex')

  const url = `${cfg.baseUrl}${path}${upperMethod === 'GET' && qs ? `?${qs}` : ''}`
  const headers = {
    'X-BAPI-API-KEY': apiKey,
    'X-BAPI-TIMESTAMP': timestamp,
    'X-BAPI-RECV-WINDOW': String(recvWindow),
    'X-BAPI-SIGN': signature,
    'content-type': 'application/json',
  }
  const timer = timeoutSignal()
  try {
    const response = await fetch(url, {
      method: upperMethod,
      headers,
      body: upperMethod === 'GET' ? undefined : bodyString,
      signal: timer.signal,
    })
    if (!response.ok) throw new Error(`Bybit testnet HTTP ${response.status}`)
    return ensureBybitSuccess(await response.json(), `${upperMethod} ${path}`)
  } finally {
    timer.clear()
  }
}

export function normalizeBybitSymbol(symbol, config = loadConfig()) {
  const cfg = bybitConfig(config)
  const clean = String(symbol || '').toUpperCase().replace(/USDT$/, '')
  if (!cfg.symbols.includes(clean)) throw new Error(`Symbol ${clean || '(empty)'} is not allowed for Bybit testnet`)
  return `${clean}${cfg.quote || 'USDT'}`
}

export async function fetchBybitTicker(symbol, config = loadConfig()) {
  const cfg = bybitConfig(config)
  const fullSymbol = normalizeBybitSymbol(symbol, config)
  const data = await bybitPublicGet('/v5/market/tickers', { category: cfg.category, symbol: fullSymbol }, config)
  const ticker = data.result?.list?.[0]
  if (!ticker) throw new Error(`No Bybit ticker for ${fullSymbol}`)
  const price = Number(ticker.markPrice || ticker.lastPrice)
  if (!Number.isFinite(price) || price <= 0) throw new Error(`Invalid Bybit price for ${fullSymbol}`)
  return { symbol: fullSymbol, price, ticker }
}

export async function fetchBybitInstrument(symbol, config = loadConfig()) {
  const cfg = bybitConfig(config)
  const fullSymbol = normalizeBybitSymbol(symbol, config)
  const data = await bybitPublicGet('/v5/market/instruments-info', { category: cfg.category, symbol: fullSymbol }, config)
  const instrument = data.result?.list?.[0]
  if (!instrument) throw new Error(`No Bybit instrument metadata for ${fullSymbol}`)
  return instrument
}

export async function getBybitApiKeyInfo(config = loadConfig()) {
  const data = await bybitSignedRequest('GET', '/v5/user/query-api', { config })
  return data.result
}

export function assertBybitApiKeySafety(info) {
  if (!info || typeof info !== 'object') throw new Error('Cannot validate Bybit API key')
  if (Number(info.readOnly) !== 0) throw new Error('Bybit API key is read-only; testnet orders require Read-Write')

  const permissions = info.permissions || {}
  const contractTrade = Array.isArray(permissions.ContractTrade) ? permissions.ContractTrade : []
  if (!contractTrade.includes('Order') || !contractTrade.includes('Position')) {
    throw new Error('Bybit API key needs ContractTrade permissions: Order and Position')
  }

  const wallet = Array.isArray(permissions.Wallet) ? permissions.Wallet : []
  if (wallet.length > 0) {
    throw new Error(`Unsafe Bybit API key: Wallet permissions must be empty, found: ${wallet.join(', ')}`)
  }

  return {
    ok: true,
    readOnly: info.readOnly,
    contractTrade,
    walletPermissions: wallet,
    ipBound: Array.isArray(info.ips) && info.ips.length > 0,
  }
}

export async function getBybitWallet(config = loadConfig()) {
  const cfg = bybitConfig(config)
  const data = await bybitSignedRequest('GET', '/v5/account/wallet-balance', {
    query: { accountType: cfg.accountType || 'UNIFIED' },
    config,
  })
  const account = data.result?.list?.[0]
  if (!account) throw new Error('Bybit testnet wallet response is empty')
  return account
}

export async function getBybitPosition(symbol, config = loadConfig()) {
  const cfg = bybitConfig(config)
  const fullSymbol = normalizeBybitSymbol(symbol, config)
  const data = await bybitSignedRequest('GET', '/v5/position/list', {
    query: { category: cfg.category, symbol: fullSymbol },
    config,
  })
  const rows = Array.isArray(data.result?.list) ? data.result.list : []
  return rows.find((row) => Number(row.size) > 0) || null
}

function decimalPlaces(step) {
  const raw = String(step)
  if (raw.includes('e-')) return Number(raw.split('e-')[1])
  const dot = raw.indexOf('.')
  return dot < 0 ? 0 : raw.length - dot - 1
}

function floorToStep(value, step) {
  const n = Number(value)
  const s = Number(step)
  const decimals = decimalPlaces(step)
  return Number((Math.floor((n + Number.EPSILON) / s) * s).toFixed(decimals))
}

function roundToStep(value, step) {
  const n = Number(value)
  const s = Number(step)
  const decimals = decimalPlaces(step)
  return Number((Math.round(n / s) * s).toFixed(decimals))
}

function formatToStep(value, step) {
  return Number(value).toFixed(decimalPlaces(step))
}

function finitePositive(value, name) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be > 0`)
  return n
}

export async function buildBybitTestnetPlan({ symbol, side, stopPct, takePct, equity, config = loadConfig() }) {
  const cfg = bybitConfig(config)
  const cleanSide = String(side || '').toLowerCase()
  if (!['long', 'short'].includes(cleanSide)) throw new Error('side must be long or short')
  if (config.risk.maxLeverage !== 1) throw new Error('JARVIS Trader Bybit v0.2 is hard-locked to 1x leverage')

  const stop = finitePositive(stopPct, 'stopPct')
  const take = finitePositive(takePct, 'takePct')
  const accountEquity = finitePositive(equity, 'equity')
  const [{ symbol: fullSymbol, price }, instrument] = await Promise.all([
    fetchBybitTicker(symbol, config),
    fetchBybitInstrument(symbol, config),
  ])

  const maxRiskUsd = accountEquity * (config.risk.maxRiskPerTradePct / 100)
  const maxNotional = accountEquity * (config.risk.maxPositionPct / 100)
  const notionalFromRisk = maxRiskUsd / (stop / 100)
  const targetNotional = Math.min(notionalFromRisk, maxNotional)

  const qtyStep = instrument.lotSizeFilter?.qtyStep
  const minOrderQty = Number(instrument.lotSizeFilter?.minOrderQty || 0)
  const minNotional = Number(instrument.lotSizeFilter?.minNotionalValue || 0)
  const tickSize = instrument.priceFilter?.tickSize
  if (!qtyStep || !tickSize) throw new Error(`Missing Bybit precision metadata for ${fullSymbol}`)

  const quantity = floorToStep(targetNotional / price, qtyStep)
  const actualNotional = quantity * price
  if (quantity <= 0 || quantity < minOrderQty) {
    throw new Error(`Risk-sized quantity ${quantity} is below Bybit minimum ${minOrderQty}`)
  }
  if (minNotional > 0 && actualNotional < minNotional) {
    throw new Error(`Risk-sized notional ${actualNotional.toFixed(2)} is below Bybit minimum ${minNotional}`)
  }

  const rawStop = cleanSide === 'long' ? price * (1 - stop / 100) : price * (1 + stop / 100)
  const rawTake = cleanSide === 'long' ? price * (1 + take / 100) : price * (1 - take / 100)
  const stopPrice = roundToStep(rawStop, tickSize)
  const takePrice = roundToStep(rawTake, tickSize)
  const worstCaseLoss = actualNotional * (stop / 100)
  const targetProfit = actualNotional * (take / 100)

  if (worstCaseLoss > maxRiskUsd + 1e-8) throw new Error('Risk guard rejected Bybit testnet trade: max risk exceeded')
  if (actualNotional > maxNotional + 1e-8) throw new Error('Risk guard rejected Bybit testnet trade: max position exceeded')

  return {
    mode: 'bybit-testnet',
    endpoint: cfg.baseUrl,
    category: cfg.category,
    symbol: fullSymbol,
    side: cleanSide,
    bybitSide: cleanSide === 'long' ? 'Buy' : 'Sell',
    orderType: 'Market',
    entryReferencePrice: price,
    quantity: formatToStep(quantity, qtyStep),
    qtyStep,
    stopPrice: formatToStep(stopPrice, tickSize),
    takePrice: formatToStep(takePrice, tickSize),
    stopPct: stop,
    takePct: take,
    notional: actualNotional,
    equity: accountEquity,
    worstCaseLoss,
    targetProfit,
    riskPctOfEquity: (worstCaseLoss / accountEquity) * 100,
    leverage: 1,
    generatedAt: new Date().toISOString(),
  }
}

function assertTestnetExecutionGate(confirmation) {
  if (process.env.JARVIS_TRADER_TESTNET_EXECUTION !== 'YES') {
    throw new Error('Testnet execution is locked. Set JARVIS_TRADER_TESTNET_EXECUTION=YES locally.')
  }
  if (confirmation !== 'TESTNET') {
    throw new Error('Testnet execution requires --confirm TESTNET')
  }
}

export async function submitBybitTestnetOrder(plan, { confirmation, config = loadConfig() } = {}) {
  bybitConfig(config)
  assertTestnetExecutionGate(confirmation)
  const keyInfo = await getBybitApiKeyInfo(config)
  assertBybitApiKeySafety(keyInfo)

  const orderLinkId = `koda-${Date.now()}`
  const body = {
    category: plan.category,
    symbol: plan.symbol,
    side: plan.bybitSide,
    orderType: 'Market',
    qty: String(plan.quantity),
    positionIdx: 0,
    orderLinkId,
    reduceOnly: false,
    takeProfit: String(plan.takePrice),
    stopLoss: String(plan.stopPrice),
    tpslMode: 'Full',
    tpOrderType: 'Market',
    slOrderType: 'Market',
    tpTriggerBy: 'MarkPrice',
    slTriggerBy: 'MarkPrice',
  }

  const data = await bybitSignedRequest('POST', '/v5/order/create', { body, config })
  return { orderLinkId, orderId: data.result?.orderId, response: data }
}

export async function closeBybitTestnetPosition(symbol, { confirmation, config = loadConfig() } = {}) {
  const cfg = bybitConfig(config)
  assertTestnetExecutionGate(confirmation)
  const keyInfo = await getBybitApiKeyInfo(config)
  assertBybitApiKeySafety(keyInfo)
  const position = await getBybitPosition(symbol, config)
  if (!position) throw new Error(`No open Bybit testnet position for ${normalizeBybitSymbol(symbol, config)}`)

  const side = position.side === 'Buy' ? 'Sell' : 'Buy'
  const body = {
    category: cfg.category,
    symbol: position.symbol,
    side,
    orderType: 'Market',
    qty: '0',
    positionIdx: Number(position.positionIdx || 0),
    reduceOnly: true,
    closeOnTrigger: true,
    orderLinkId: `koda-close-${Date.now()}`,
  }
  const data = await bybitSignedRequest('POST', '/v5/order/create', { body, config })
  return { symbol: position.symbol, closingSide: side, orderId: data.result?.orderId, response: data }
}
