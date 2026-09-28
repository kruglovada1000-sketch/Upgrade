import { loadConfig } from './trader-lib.mjs'
import { fetchBybitTicker } from './bybit-testnet-lib.mjs'

const config = loadConfig()
const rows = await Promise.all(config.bybitTestnet.symbols.map(async (symbol) => {
  const row = await fetchBybitTicker(symbol, config)
  return { symbol: row.symbol, price: row.price }
}))

console.table(rows)
console.log(`Market source: Bybit TESTNET (${config.bybitTestnet.baseUrl})`)
console.log('Execution: locked unless local credentials + JARVIS_TRADER_TESTNET_EXECUTION=YES + --confirm TESTNET')
