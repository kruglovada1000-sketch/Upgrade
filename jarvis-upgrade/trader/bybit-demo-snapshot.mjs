import { loadConfig } from './trader-lib.mjs'
import { fetchBybitTicker } from './bybit-demo-lib.mjs'

const config = loadConfig()
const rows = await Promise.all(config.bybitDemo.symbols.map(async (symbol) => {
  const row = await fetchBybitTicker(symbol, config)
  return { symbol: row.symbol, price: row.price }
}))

console.table(rows)
console.log(`Market source: Bybit DEMO (${config.bybitDemo.baseUrl})`)
console.log('Execution: locked unless local demo credentials + JARVIS_TRADER_DEMO_EXECUTION=YES + --confirm DEMO')
