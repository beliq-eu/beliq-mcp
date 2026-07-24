import { describe, it, expect } from 'vitest'
import path from 'node:path'
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
    const invoice = {
      number: 'MCP-INT-001',
      issueDate: '2026-01-15',
      currencyCode: 'EUR',
      buyerReference: '04011000-12345-06',
      seller: {
        name: 'Seller GmbH',
        vatId: 'DE123456789',
        email: 'billing@seller.example',
        address: { street: 'Hauptstr. 1', city: 'Berlin', postalCode: '10115', countryCode: 'DE' },
      },
      buyer: {
        name: 'Buyer GmbH',
        address: { street: 'Marktweg 2', city: 'Munich', postalCode: '80331', countryCode: 'DE' },
      },
      lines: [
        {
          description: 'Consulting',
          quantity: 10,
          unitCode: 'HUR',
          unitPrice: 100,
          lineTotal: 1000,
          vatRate: 19,
          vatCategoryCode: 'S',
        },
      ],
      totalNetAmount: 1000,
      totalTaxAmount: 190,
      totalGrossAmount: 1190,
    }

    // verify:false so the smoke asserts the round-trip (produce XML, convert it,
    // read it back) without depending on full XRechnung business-rule completeness.
    const gen = await runGenerate({ standard: 'xrechnung', invoice, output: 'xml', verify: false }, deps)
    expect(gen.isError).toBeFalsy()
    const gsc = gen.structuredContent as Record<string, unknown>
    expect(typeof gsc.xml).toBe('string')
    // The generate tool always seals: the document hash and verdict come back.
    expect(typeof gsc.sha256).toBe('string')
    expect(typeof (gsc.validationResult as { valid: unknown }).valid).toBe('boolean')

    const conv = await runConvert({ document: gsc.xml as string, targetFormat: 'ubl', sourceFormat: 'auto' }, deps)
    expect(conv.isError).toBeFalsy()
    const csc = conv.structuredContent as Record<string, unknown>
    expect(csc.output).toBe('xml')
    expect(typeof csc.xml).toBe('string')

    const parsed = await runParse({ document: csc.xml as string, format: 'auto' }, deps)
    expect(parsed.isError).toBeFalsy()
    const psc = parsed.structuredContent as Record<string, unknown>
    expect((psc.invoice as { number?: string }).number).toBe('MCP-INT-001')
  })
})
