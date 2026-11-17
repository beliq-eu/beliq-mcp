import { describe, it, expect } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { Beliq } from '@beliq/sdk'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { RETRY_BUDGET_MS, TIMEOUT_MS } from '../src/client.js'
import { registerAllTools } from '../src/tools/register.js'

// A tool call against a real SDK client and a real HTTP server on 127.0.0.1,
// with the server's `Retry-After: 15`, an MCP client's 60-second request limit
// and this server's retry budget and attempt deadline all scaled by SCALE.
// The SDK's own backoff waits are not scaled.
const SCALE = 1 / 5
const RETRY_AFTER_S = 15 * SCALE
const HOST_LIMIT_MS = 60_000 * SCALE

const here = path.dirname(fileURLToPath(import.meta.url))
const VALID = JSON.parse(readFileSync(path.join(here, 'fixtures', 'validate-valid.json'), 'utf8')) as unknown

type Handler = (req: IncomingMessage, res: ServerResponse) => void

async function withApi<T>(handler: Handler, run: (baseUrl: string) => Promise<T>): Promise<T> {
  const server: Server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    return await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

async function callTool(
  baseUrl: string,
  name: string,
  args: Record<string, unknown>,
): Promise<{ isError: boolean; text: string; ms: number; structured: unknown }> {
  const client = new Beliq({
    apiKey: 'blq_test_outage',
    baseUrl,
    retryBudgetMs: RETRY_BUDGET_MS * SCALE,
    timeoutMs: TIMEOUT_MS * SCALE,
  })
  const server = new McpServer({ name: 'beliq-mcp', version: 'test' })
  registerAllTools(server, { client })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const mcp = new Client({ name: 'test-client', version: 'test' })
  await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)])
  const started = performance.now()
  const res = await mcp.callTool(
    { name, arguments: args },
    undefined,
    { timeout: HOST_LIMIT_MS },
  )
  const ms = performance.now() - started
  await mcp.close()
  const text = (res.content as Array<{ text?: string }>).map((c) => c.text ?? '').join('\n')
  return { isError: res.isError === true, text, ms, structured: res.structuredContent }
}

const callValidate = (baseUrl: string) => callTool(baseUrl, 'beliq_validate_einvoice', { document: '<Invoice/>' })

const databaseUnavailable: Handler = (_req, res) => {
  res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': String(RETRY_AFTER_S) })
  res.end(JSON.stringify({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'database unavailable' } }))
}

/** The edge's answer with no beliq code and no `Retry-After`, once, then `then`. */
function blipThen(then: Handler): { handler: Handler; requests: () => number } {
  let requests = 0
  return {
    requests: () => requests,
    handler: (req, res) => {
      requests++
      if (requests > 1) return then(req, res)
      res.writeHead(503, { 'Content-Type': 'text/plain' })
      res.end('upstream unavailable')
    },
  }
}

const valid: Handler = (_req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ success: true, data: VALID }))
}

describe('a tool call during an outage ends inside the MCP host limit', () => {
  it('the scaled fit leaves room for the last attempt', () => {
    expect((RETRY_BUDGET_MS + TIMEOUT_MS) * SCALE).toBeLessThan(HOST_LIMIT_MS)
  })

  it('tells the model when to try again after a 503 DATABASE_UNAVAILABLE', async () => {
    let requests = 0
    const result = await withApi(
      (req, res) => {
        requests++
        databaseUnavailable(req, res)
      },
      callValidate,
    )
    expect(result.isError).toBe(true)
    expect(result.text).toContain('beliq is unavailable for now')
    expect(result.text).toContain(`Try the same call again in ${RETRY_AFTER_S} seconds.`)
    expect(result.text).toContain('DATABASE_UNAVAILABLE')
    expect(requests).toBe(1)
    expect(result.ms).toBeLessThan(HOST_LIMIT_MS)
  })

  it('names the wait of a rate limit whose Retry-After passes the budget', async () => {
    let requests = 0
    const result = await withApi(
      (_req, res) => {
        requests++
        res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(RETRY_AFTER_S) })
        res.end(JSON.stringify({ success: false, error: { code: 'RATE_LIMITED', message: 'rate limited' } }))
      },
      callValidate,
    )
    expect(result.isError).toBe(true)
    expect(result.text).toContain('RATE_LIMITED')
    expect(result.text).toContain(`Try the same call again in ${RETRY_AFTER_S} seconds.`)
    expect(requests).toBe(1)
  })

  it('rides a blip shorter than the retry budget', async () => {
    const api = blipThen(valid)
    const result = await withApi(api.handler, callValidate)
    expect(result.isError).toBe(false)
    expect(result.text).toContain('VALID')
    expect(api.requests()).toBe(2)
    expect(result.ms).toBeLessThan(HOST_LIMIT_MS)
  })

  it('ends before the host limit when the retry after a blip hangs', async () => {
    const api = blipThen(() => {})
    const result = await withApi(api.handler, callValidate)
    expect(result.isError).toBe(true)
    expect(api.requests()).toBe(2)
    expect(result.ms).toBeLessThan(HOST_LIMIT_MS)
  }, 20_000)

  it('says the API could not be reached when nothing listens', async () => {
    const gone = createServer()
    await new Promise<void>((resolve) => gone.listen(0, '127.0.0.1', resolve))
    const baseUrl = `http://127.0.0.1:${(gone.address() as AddressInfo).port}`
    await new Promise<void>((resolve) => gone.close(() => resolve()))

    const result = await callValidate(baseUrl)
    expect(result.isError).toBe(true)
    expect(result.text).toContain('beliq is unavailable for now')
    expect(result.text).toContain('beliq did not say when')
    expect(result.text).toContain('Could not reach the beliq API')
    expect(result.ms).toBeLessThan(HOST_LIMIT_MS)
  })

  it('check_account reports an API it cannot reach as a failed check', async () => {
    const gone = createServer()
    await new Promise<void>((resolve) => gone.listen(0, '127.0.0.1', resolve))
    const baseUrl = `http://127.0.0.1:${(gone.address() as AddressInfo).port}`
    await new Promise<void>((resolve) => gone.close(() => resolve()))

    const result = await callTool(baseUrl, 'beliq_check_account', {})
    expect(result.structured).toMatchObject({ ok: false, status: 0 })
    expect(result.text).toContain('Could not reach the beliq API')
    expect(result.ms).toBeLessThan(HOST_LIMIT_MS)
  })

  it('stops waiting to retry once the MCP client cancels the call', async () => {
    let requests = 0
    let settledAt: number | undefined
    class SettleRecordingBeliq extends Beliq {
      override async validate(...args: Parameters<Beliq['validate']>): ReturnType<Beliq['validate']> {
        try {
          return await super.validate(...args)
        } finally {
          settledAt = performance.now()
        }
      }
    }
    await withApi(
      (_req, res) => {
        requests++
        res.writeHead(503, { 'Content-Type': 'application/json', 'Retry-After': '15' })
        res.end(JSON.stringify({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'database unavailable' } }))
      },
      async (baseUrl) => {
        // A budget long enough that the SDK waits out the 15-second Retry-After.
        const client = new SettleRecordingBeliq({ apiKey: 'blq_test_outage', baseUrl, retryBudgetMs: 120_000 })
        const server = new McpServer({ name: 'beliq-mcp', version: 'test' })
        registerAllTools(server, { client })
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
        const mcp = new Client({ name: 'test-client', version: 'test' })
        await Promise.all([server.connect(serverTransport), mcp.connect(clientTransport)])
        const cancel = new AbortController()
        const call = mcp.callTool({ name: 'beliq_validate_einvoice', arguments: { document: '<Invoice/>' } }, undefined, {
          signal: cancel.signal,
        })
        while (requests === 0) await new Promise((resolve) => setTimeout(resolve, 10))
        const cancelledAt = performance.now()
        cancel.abort()
        await expect(call).rejects.toThrow()
        while (settledAt === undefined && performance.now() - cancelledAt < 2_000) {
          await new Promise((resolve) => setTimeout(resolve, 10))
        }
        await mcp.close()
        expect(settledAt).toBeDefined()
        expect(settledAt! - cancelledAt).toBeLessThan(1_000)
      },
    )
    expect(requests).toBe(1)
  })
})
