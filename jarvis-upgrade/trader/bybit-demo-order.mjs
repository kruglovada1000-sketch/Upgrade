import { appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, parseCliArgs } from './trader-lib.mjs'
import { buildBybitDemoPlan, getBybitWallet, submitBybitDemoOrder } from './bybit-demo-lib.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const config = loadConfig()
const args = parseCliArgs(process.argv.slice(2))
const wallet = await getBybitWallet(config)
const equity = Number(wallet.totalEquity)
if (!Number.isFinite(equity) || equity <= 0) throw new Error('Bybit demo totalEquity must be > 0')

const plan = await buildBybitDemoPlan({
  symbol: args.symbol || 'BTC',
  side: args.side || 'long',
  stopPct: args.stopPct || 1,
  takePct: args.takePct || 2,
  equity,
  config,
})

console.log('JARVIS Trader — Bybit DEMO order candidate')
console.log(JSON.stringify(plan, null, 2))

const result = await submitBybitDemoOrder(plan, { confirmation: args.confirm, config })
const event = {
  type: 'bybit_demo_order_submitted',
  timestamp: new Date().toISOString(),
  plan,
  orderId: result.orderId,
  orderLinkId: result.orderLinkId,
}
appendFileSync(join(here, 'trader-log.jsonl'), `${JSON.stringify(event)}\n`)

console.log('\nDEMO ORDER SUBMITTED')
console.log(JSON.stringify({ orderId: result.orderId, orderLinkId: result.orderLinkId }, null, 2))
console.log('TP/SL were attached to the simulated Bybit Demo order.')
