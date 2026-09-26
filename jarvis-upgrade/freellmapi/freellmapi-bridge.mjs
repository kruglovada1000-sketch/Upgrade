const baseUrl = (process.env.FREELLMAPI_URL ?? 'http://localhost:3001').replace(/\/+$/, '')
const apiKey = process.env.FREELLMAPI_API_KEY
const model = process.env.FREELLMAPI_MODEL ?? 'auto'

if (!apiKey) {
  console.error('[jarvis] FREELLMAPI_API_KEY is not set.')
  console.error('[jarvis] Copy the unified key from FreeLLMAPI -> Keys and set it before launch.')
  process.exit(1)
}

process.env.ANTHROPIC_BASE_URL = baseUrl
process.env.ANTHROPIC_AUTH_TOKEN = apiKey
process.env.ANTHROPIC_MODEL = model
process.env.ANTHROPIC_DEFAULT_OPUS_MODEL = model
process.env.ANTHROPIC_DEFAULT_SONNET_MODEL = model
process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL = model
process.env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY = '1'
process.env.JARVIS_MODEL = model

console.log(`[jarvis] FreeLLMAPI gateway ${baseUrl} · model ${model}`)

await import('../bridge/server.mjs')
