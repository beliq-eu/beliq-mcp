import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Beliq } from '@beliq/sdk'
import { runValidate, runCheckAccount, runParse, runGenerate, runConvert } from '../src/tools/shared.js'

// Live smoke tests against the real beliq API. Skipped unless BELIQ_API_KEY is
// set, and excluded from the default `npm test`. These drive the real MCP run
// functions through a real SDK client, so they exercise the same code path the
// server uses (read document, validate, shape result), end to end.

const KEY = process.env.BELIQ_API_KEY
const live = KEY ? describe : describe.skip

const here = path.dirname(fileURLToPath(import.meta.url))
const exampleXml = path.join(here, '..', 'examples', 'invalid-xrechnung.xml')
const invoice = JSON.parse(
  readFileSync(path.join(here, '..', 'examples', 'invoice.json'), 'utf8'),
) as Record<string, unknown>

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

  it('generates an XRechnung, converts it to UBL, and parses the result over the real API', async () => {
    // verify:true: examples/invoice.json is a complete XRechnung, so the smoke
    // proves the business rules as well as the round-trip (produce XML, convert
    // it, read it back).
    const gen = await runGenerate({ standard: 'xrechnung', invoice, output: 'xml', verify: true }, deps)
    expect(gen.isError).toBeFalsy()
    const gsc = gen.structuredContent as Record<string, unknown>
    expect(typeof gsc.xml).toBe('string')
    // The generate tool always seals: the document hash and verdict come back.
    expect(typeof gsc.sha256).toBe('string')
    expect((gsc.validationResult as { valid: unknown }).valid).toBe(true)

    const conv = await runConvert({ document: gsc.xml as string, targetFormat: 'ubl', sourceFormat: 'auto' }, deps)
    expect(conv.isError).toBeFalsy()
    const csc = conv.structuredContent as Record<string, unknown>
    expect(csc.output).toBe('xml')
    expect(typeof csc.xml).toBe('string')

    const parsed = await runParse({ document: csc.xml as string, format: 'auto' }, deps)
    expect(parsed.isError).toBeFalsy()
    const psc = parsed.structuredContent as Record<string, unknown>
    expect((psc.invoice as { number?: string }).number).toBe(invoice.number)
  })
})
