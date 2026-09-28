import { buildPaperTrade, fetchAllMids, loadConfig, parseCliArgs } from './trader-lib.mjs'

const config = loadConfig()
const args = parseCliArgs(process.argv.slice(2))
const symbol = String(args.symbol || 'BTC').toUpperCase()
const side = String(args.side || 'long').toLowerCase()
const stopPct = Number(args.stopPct || 1)
const takePct = Number(args.takePct || 2)
const equity = args.equity ? Number(args.equity) : config.paper.startingEquity

const mids = await fetchAllMids(config)
if (!(symbol in mids)) throw new Error(`No market price for ${symbol}`)

const plan = buildPaperTrade({
  config,
  symbol,
  side,
  price: Number(mids[symbol]),
  stopPct,
  takePct,
  equity,
})

console.log('JARVIS Trader paper plan')
console.log(JSON.stringify(plan, null, 2))
console.log('\nNO ORDER WAS SENT. Real execution does not exist in v0.1.')
