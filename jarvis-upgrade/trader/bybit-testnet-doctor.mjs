import { loadConfig } from './trader-lib.mjs'
import {
  assertBybitApiKeySafety,
  bybitCredentialsFromEnv,
  fetchBybitTicker,
  getBybitApiKeyInfo,
} from './bybit-testnet-lib.mjs'

const config = loadConfig()
const checks = []

function add(name, ok, detail) {
  checks.push({ name, ok, detail })
}

add('bybit_endpoint_is_testnet', config.bybitTestnet?.baseUrl === 'https://api-testnet.bybit.com', config.bybitTestnet?.baseUrl)
add('mainnet_execution_not_configured', !JSON.stringify(config).includes('https://api.bybit.com'), 'no Bybit mainnet REST endpoint in trader config')
add('leverage_is_1x', config.risk?.maxLeverage === 1, `maxLeverage=${config.risk?.maxLeverage}`)
add('stop_required', config.risk?.requireStopLoss === true, `requireStopLoss=${config.risk?.requireStopLoss}`)
add('take_required', config.risk?.requireTakeProfit === true, `requireTakeProfit=${config.risk?.requireTakeProfit}`)

try {
  const rows = await Promise.all(config.bybitTestnet.symbols.map((symbol) => fetchBybitTicker(symbol, config)))
  add('bybit_testnet_market_data', rows.every((row) => row.price > 0), rows.map((row) => `${row.symbol}=${row.price}`).join(', '))
} catch (error) {
  add('bybit_testnet_market_data', false, error.message)
}

const hasKey = Boolean(process.env.BYBIT_TESTNET_API_KEY)
const hasSecret = Boolean(process.env.BYBIT_TESTNET_API_SECRET)
if (hasKey !== hasSecret) {
  add('credentials_pair', false, 'API key and secret must both be set or both omitted')
} else if (!hasKey) {
  add('credentials_optional_for_public_doctor', true, 'no local credentials present; authenticated checks skipped')
} else {
  try {
    bybitCredentialsFromEnv()
    const info = await getBybitApiKeyInfo(config)
    const safety = assertBybitApiKeySafety(info)
    add('testnet_api_auth', true, `key note=${info.note || '(none)'}`)
    add('wallet_permissions_empty', safety.walletPermissions.length === 0, 'Wallet permissions are empty')
    add('contract_trade_permissions', safety.contractTrade.includes('Order') && safety.contractTrade.includes('Position'), safety.contractTrade.join(', '))
  } catch (error) {
    add('testnet_api_auth', false, error.message)
  }
}

console.table(checks)
const failed = checks.filter((check) => !check.ok)
if (failed.length) {
  console.error(`JARVIS Trader Bybit doctor: ${failed.length} check(s) failed.`)
  process.exit(1)
}
console.log('JARVIS Trader Bybit doctor: READY — Bybit TESTNET only.')
