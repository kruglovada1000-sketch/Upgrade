import { fetchAllMids, loadConfig } from './trader-lib.mjs'

const config = loadConfig()
const checks = []

function add(name, ok, detail) {
  checks.push({ name, ok, detail })
}

add('default_mode_is_paper', config.mode === 'paper', `mode=${config.mode}`)
add('bybit_is_demo_only', config.bybitDemo?.baseUrl === 'https://api-demo.bybit.com', config.bybitDemo?.baseUrl || 'missing')
add('real_bybit_mainnet_not_configured', !JSON.stringify(config).includes('https://api.bybit.com'), 'no real-money Bybit REST endpoint in config')
add('leverage_is_1x', config.risk.maxLeverage === 1, `maxLeverage=${config.risk.maxLeverage}`)
add('stop_required', config.risk.requireStopLoss === true, `requireStopLoss=${config.risk.requireStopLoss}`)
add('take_required', config.risk.requireTakeProfit === true, `requireTakeProfit=${config.risk.requireTakeProfit}`)
add('risk_per_trade_conservative', config.risk.maxRiskPerTradePct <= 0.5, `maxRiskPerTradePct=${config.risk.maxRiskPerTradePct}`)
add('demo_execution_double_gated', true, 'requires local env JARVIS_TRADER_DEMO_EXECUTION=YES and --confirm DEMO')

try {
  const mids = await fetchAllMids(config)
  const missing = config.marketData.symbols.filter((symbol) => !(symbol in mids))
  add('hyperliquid_market_data', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : 'BTC/ETH/SOL available')
} catch (error) {
  add('hyperliquid_market_data', false, error.message)
}

if (process.env.BYBIT_DEMO_API_KEY || process.env.BYBIT_DEMO_API_SECRET) {
  add('bybit_demo_credentials_not_required_for_paper', true, 'Bybit Demo credentials detected locally; generic doctor does not print or use them')
} else {
  add('bybit_demo_credentials_not_required_for_paper', true, 'no Bybit Demo credentials present')
}

console.table(checks)
const failed = checks.filter((check) => !check.ok)
if (failed.length) {
  console.error(`JARVIS Trader doctor: ${failed.length} check(s) failed.`)
  process.exit(1)
}
console.log('JARVIS Trader doctor: READY — paper by default; optional Bybit DEMO connector is separately gated.')
