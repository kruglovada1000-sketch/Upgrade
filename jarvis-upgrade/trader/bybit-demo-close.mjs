import { appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, parseCliArgs } from './trader-lib.mjs'
import { closeBybitDemoPosition } from './bybit-demo-lib.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const config = loadConfig()
const args = parseCliArgs(process.argv.slice(2))
const symbol = args.symbol || 'BTC'

const result = await closeBybitDemoPosition(symbol, { confirmation: args.confirm, config })
appendFileSync(join(here, 'trader-log.jsonl'), `${JSON.stringify({
  type: 'bybit_demo_position_close_submitted',
  timestamp: new Date().toISOString(),
  symbol: result.symbol,
  closingSide: result.closingSide,
  orderId: result.orderId,
})}\n`)

console.log('BYBIT DEMO CLOSE SUBMITTED')
console.log(JSON.stringify({ symbol: result.symbol, closingSide: result.closingSide, orderId: result.orderId }, null, 2))
