import { loadConfig } from './trader-lib.mjs'
import {
  assertBybitApiKeySafety,
  bybitCredentialsFromEnv,
  fetchBybitTicker,
  getBybitApiKeyInfo,
} from './bybit-demo-lib.mjs'

const config = loadConfig()
const checks = []

function add(name, ok, detail, { warning = false } = {}) {
  checks.push({ name, ok, warning, detail })
}

add('bybit_endpoint_is_demo', config.bybitDemo?.baseUrl === 'https://api-demo.bybit.com', config.bybitDemo?.baseUrl)
add('real_mainnet_execution_not_configured', !JSON.stringify(config).includes('https://api.bybit.com'), 'no real-money Bybit REST endpoint in trader config')
add('leverage_is_1x', config.risk?.maxLeverage === 1, `maxLeverage=${config.risk?.maxLeverage}`)
add('stop_required', config.risk?.requireStopLoss === true, `requireStopLoss=${config.risk?.requireStopLoss}`)
add('take_required', config.risk?.requireTakeProfit === true, `requireTakeProfit=${config.risk?.requireTakeProfit}`)

try {
  const rows = await Promise.all(config.bybitDemo.symbols.map((symbol) => fetchBybitTicker(symbol, config)))
  add('bybit_demo_market_data', rows.every((row) => row.price > 0), rows.map((row) => `${row.symbol}=${row.price}`).join(', '))
} catch (error) {
  const message = String(error?.message || error)
  const hostedRunnerBlocked = process.env.CI === 'true' && /HTTP 403/.test(message)
  if (hostedRunnerBlocked) {
    add('bybit_demo_market_data', true, `${message}; hosted CI runner blocked, local check still required`, { warning: true })
  } else {
    add('bybit_demo_market_data', false, message)
  }
}

const hasKey = Boolean(process.env.BYBIT_DEMO_API_KEY)
const hasSecret = Boolean(process.env.BYBIT_DEMO_API_SECRET)
if (hasKey !== hasSecret) {
  add('credentials_pair', false, 'API key and secret must both be set or both omitted')
} else if (!hasKey) {
  add('credentials_optional_for_public_doctor', true, 'no local demo credentials present; authenticated checks skipped')
} else {
  try {
    bybitCredentialsFromEnv()
    const info = await getBybitApiKeyInfo(config)
    const safety = assertBybitApiKeySafety(info)
    add('demo_api_auth', true, `key note=${info.note || '(none)'}`)
    add('wallet_permissions_empty', safety.walletPermissions.length === 0, 'Wallet permissions are empty')
    add('contract_trade_permissions', safety.contractTrade.includes('Order') && safety.contractTrade.includes('Position'), safety.contractTrade.join(', '))
  } catch (error) {
    add('demo_api_auth', false, error.message)
  }
}

console.table(checks)
const failed = checks.filter((check) => !check.ok)
const warnings = checks.filter((check) => check.warning)
if (failed.length) {
  console.error(`JARVIS Trader Bybit Demo doctor: ${failed.length} check(s) failed.`)
  process.exit(1)
}
if (warnings.length) {
  console.warn(`JARVIS Trader Bybit Demo doctor: READY WITH ${warnings.length} CI warning(s). Run locally before demo execution.`)
} else {
  console.log('JARVIS Trader Bybit Demo doctor: READY — simulated Demo Trading only.')
}
