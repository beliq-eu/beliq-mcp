import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { BeliqApiError } from '@beliq/sdk'
import { createClient } from '../src/client.js'

// A real HTTP server that answers each request from a script, so the retry
// budget is measured on the client the server builds, not on a fake.

const OUTAGE_BODY = JSON.stringify({
  success: false,
  error: { code: 'DATABASE_UNAVAILABLE', message: 'The database is unavailable.' },
})
const VALID_BODY = JSON.stringify({ success: true, data: { valid: true, format: 'cii', errors: [], warnings: [] } })

interface Scripted {
  baseUrl: string
  requests: () => number
}

let server: Server | undefined
afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
  server = undefined
})

/** Answers the first request with a DATABASE_UNAVAILABLE outage and every later one with a valid verdict. */
async function outageThenValid(retryAfterSeconds: number): Promise<Scripted> {
  let count = 0
  server = createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      count++
      if (count === 1) {
        res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': String(retryAfterSeconds) })
        res.end(OUTAGE_BODY)
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(VALID_BODY)
      }
    })
  })
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return { baseUrl: `http://127.0.0.1:${port}`, requests: () => count }
}

const config = (baseUrl: string) => ({ apiKey: 'blq_test_budget', baseUrl, auth: 'header' as const })

describe('the client the server builds', () => {
  it('retries an outage whose Retry-After fits the budget', async () => {
    const api = await outageThenValid(1)
    const result = await createClient(config(api.baseUrl)).validate('<x/>')
    expect(result.valid).toBe(true)
    expect(api.requests()).toBe(2)
  })

  it('ends at once on an outage whose Retry-After is longer than the budget', async () => {
    // The SDK's default budget of 15 minutes would wait the 45 s out.
    const api = await outageThenValid(45)
    const started = performance.now()
    const failure = await createClient(config(api.baseUrl))
      .validate('<x/>')
      .catch((err: unknown) => err)
    expect(performance.now() - started).toBeLessThan(5_000)
    expect(failure).toBeInstanceOf(BeliqApiError)
    expect((failure as BeliqApiError).code).toBe('DATABASE_UNAVAILABLE')
    expect(api.requests()).toBe(1)
  }, 10_000)
})
