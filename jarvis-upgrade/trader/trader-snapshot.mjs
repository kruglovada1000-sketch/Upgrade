import { fetchAllMids, loadConfig } from './trader-lib.mjs'

const config = loadConfig()
const mids = await fetchAllMids(config)
const rows = config.marketData.symbols.map((symbol) => ({
  symbol,
  mid: Number(mids[symbol]),
}))

console.table(rows)
console.log(`Market source: ${config.marketData.provider}`)
console.log(`Execution: disabled (${config.mode} mode)`)
