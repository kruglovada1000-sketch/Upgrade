const baseUrl = (process.env.FREELLMAPI_URL ?? 'http://localhost:3001').replace(/\/+$/, '')
const apiKey = process.env.FREELLMAPI_API_KEY
const model = process.env.FREELLMAPI_MODEL ?? 'auto'

if (!apiKey) {
  console.error('FAIL: FREELLMAPI_API_KEY is not set.')
  process.exit(1)
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
}

async function main() {
  console.log(`Checking FreeLLMAPI at ${baseUrl} ...`)

  const modelsResponse = await fetch(`${baseUrl}/v1/models`, { headers })
  if (!modelsResponse.ok) {
    throw new Error(`/v1/models returned ${modelsResponse.status}: ${await modelsResponse.text()}`)
  }

  const body = await modelsResponse.json()
  const models = Array.isArray(body?.data) ? body.data.map((item) => item?.id).filter(Boolean) : []
  console.log(`OK: gateway reachable; ${models.length} model(s) visible.`)
  if (models.length) console.log(`Examples: ${models.slice(0, 8).join(', ')}`)

  if (process.env.FREELLMAPI_DOCTOR_CHAT !== '1') {
    console.log('Model request skipped. Set FREELLMAPI_DOCTOR_CHAT=1 to test one real completion.')
    return
  }

  const chatResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Reply with exactly: JARVIS ONLINE' }],
      max_tokens: 20,
      temperature: 0,
    }),
  })

  if (!chatResponse.ok) {
    throw new Error(`/v1/chat/completions returned ${chatResponse.status}: ${await chatResponse.text()}`)
  }

  const answer = await chatResponse.json()
  const text = answer?.choices?.[0]?.message?.content ?? ''
  console.log(`OK: model answered: ${String(text).trim()}`)
  console.log(`Provider: ${chatResponse.headers.get('x-routed-via') ?? 'not reported'}`)
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`)
  process.exit(1)
})
