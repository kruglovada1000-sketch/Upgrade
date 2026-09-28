import { appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig, parseCliArgs } from './trader-lib.mjs'
import { buildBybitTestnetPlan, getBybitWallet, submitBybitTestnetOrder } from './bybit-testnet-lib.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const config = loadConfig()
const args = parseCliArgs(process.argv.slice(2))
const wallet = await getBybitWallet(config)
const equity = Number(wallet.totalEquity)
if (!Number.isFinite(equity) || equity <= 0) throw new Error('Bybit testnet totalEquity must be > 0')

const plan = await buildBybitTestnetPlan({
  symbol: args.symbol || 'BTC',
  side: args.side || 'long',
  stopPct: args.stopPct || 1,
  takePct: args.takePct || 2,
  equity,
  config,
})

console.log('JARVIS Trader — Bybit TESTNET order candidate')
console.log(JSON.stringify(plan, null, 2))

const result = await submitBybitTestnetOrder(plan, { confirmation: args.confirm, config })
const event = {
  type: 'bybit_testnet_order_submitted',
  timestamp: new Date().toISOString(),
  plan,
  orderId: result.orderId,
  orderLinkId: result.orderLinkId,
}
appendFileSync(join(here, 'trader-log.jsonl'), `${JSON.stringify(event)}\n`)

console.log('\nTESTNET ORDER SUBMITTED')
console.log(JSON.stringify({ orderId: result.orderId, orderLinkId: result.orderLinkId }, null, 2))
console.log('TP/SL were attached to the testnet order. Check the Bybit Testnet position after acknowledgement.')
