import { loadConfig, parseCliArgs } from './trader-lib.mjs'
import { buildBybitTestnetPlan, getBybitWallet } from './bybit-testnet-lib.mjs'

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

console.log('JARVIS Trader — Bybit TESTNET preview')
console.log(JSON.stringify(plan, null, 2))
console.log('\nNO ORDER WAS SENT. Use trader:bybit:test with the explicit testnet gate to submit.')
