import { loadConfig } from './trader-lib.mjs'
import { assertBybitApiKeySafety, getBybitApiKeyInfo, getBybitWallet } from './bybit-demo-lib.mjs'

const config = loadConfig()
const info = await getBybitApiKeyInfo(config)
assertBybitApiKeySafety(info)
const account = await getBybitWallet(config)

const coins = Array.isArray(account.coin) ? account.coin : []
console.table(coins.map((coin) => ({
  coin: coin.coin,
  walletBalance: coin.walletBalance,
  equity: coin.equity,
  unrealisedPnl: coin.unrealisedPnl,
})))

console.log(`Total demo equity (USD): ${account.totalEquity ?? 'n/a'}`)
console.log(`Available demo balance (USD): ${account.totalAvailableBalance ?? 'n/a'}`)
console.log('Bybit DEMO only. API secret is never printed.')
