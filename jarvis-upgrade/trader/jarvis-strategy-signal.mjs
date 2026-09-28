import { parseCliArgs } from './trader-lib.mjs'
import { evaluateJarvisStrategy } from './jarvis-strategy.mjs'

const args = parseCliArgs(process.argv.slice(2))
const symbol = args.symbol || 'BTC'
const result = await evaluateJarvisStrategy(symbol)

console.log('JARVIS Strategy — original multi-timeframe signal')
console.log(JSON.stringify(result, null, 2))
console.log('\nSIGNAL ONLY — NO ORDER WAS SENT.')
