import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Beliq } from '@beliq/sdk'
import { runValidate, runCheckAccount } from '../src/tools/shared.js'

// Live smoke tests against the real beliq API. Skipped unless BELIQ_API_KEY is
// set, and excluded from the default `npm test`. These drive the real MCP run
// functions through a real SDK client, so they exercise the same code path the
// server uses (read document, validate, shape result), end to end.

const KEY = process.env.BELIQ_API_KEY
const live = KEY ? describe : describe.skip

const here = path.dirname(fileURLToPath(import.meta.url))
const exampleXml = path.join(here, '..', 'examples', 'invalid-xrechnung.xml')

live('beliq-mcp live (integration)', () => {
  const deps = { client: new Beliq({ apiKey: KEY as string, baseUrl: process.env.BELIQ_BASE_URL }) }

  it('check_account accepts the configured key and reports a plan', async () => {
    const res = await runCheckAccount(deps)
    const sc = res.structuredContent as Record<string, unknown>
    expect(sc.ok).toBe(true)
    expect(sc.status).toBe(200)
  })

  it('validates the known-invalid XRechnung example and reports a failing rule', async () => {
    const res = await runValidate({ documentPath: exampleXml, format: 'auto' }, deps)
    expect(res.isError).toBeFalsy()
    const sc = res.structuredContent as Record<string, unknown>
    expect(sc.valid).toBe(false)
    expect(sc.errorCount as number).toBeGreaterThan(0)
  })
})
