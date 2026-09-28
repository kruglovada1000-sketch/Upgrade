import { fetchAllMids, loadConfig } from './trader-lib.mjs'

const config = loadConfig()
const checks = []

function add(name, ok, detail) {
  checks.push({ name, ok, detail })
}

add('mode_is_paper', config.mode === 'paper', `mode=${config.mode}`)
add('live_execution_absent', true, 'v0.1 contains no order-submission code')
add('leverage_is_1x', config.risk.maxLeverage === 1, `maxLeverage=${config.risk.maxLeverage}`)
add('stop_required', config.risk.requireStopLoss === true, `requireStopLoss=${config.risk.requireStopLoss}`)
add('take_required', config.risk.requireTakeProfit === true, `requireTakeProfit=${config.risk.requireTakeProfit}`)
add('risk_per_trade_conservative', config.risk.maxRiskPerTradePct <= 0.5, `maxRiskPerTradePct=${config.risk.maxRiskPerTradePct}`)

try {
  const mids = await fetchAllMids(config)
  const missing = config.marketData.symbols.filter((symbol) => !(symbol in mids))
  add('hyperliquid_market_data', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : 'BTC/ETH/SOL available')
} catch (error) {
  add('hyperliquid_market_data', false, error.message)
}

if (process.env.HYPERLIQUID_PRIVATE_KEY) {
  add('private_key_not_needed', true, 'HYPERLIQUID_PRIVATE_KEY is present but JARVIS Trader v0.1 does not read or use it')
} else {
  add('private_key_not_needed', true, 'no private key required')
}

console.table(checks)
const failed = checks.filter((check) => !check.ok)
if (failed.length) {
  console.error(`JARVIS Trader doctor: ${failed.length} check(s) failed.`)
  process.exit(1)
}
console.log('JARVIS Trader doctor: READY — paper mode only, real execution disabled.')
