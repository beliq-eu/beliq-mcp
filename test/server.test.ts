import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { BeliqApiError } from '@beliq/sdk'
import type {
  AccountInfo,
  ConvertResult,
  GenerateInput,
  GenerateResult,
  ParseResult,
  ValidationResult,
} from '@beliq/sdk'
import { registerAllTools } from '../src/tools/register.js'
import type { BeliqClient } from '../src/deps.js'

// A full MCP round-trip over an in-memory transport. The injected client is a
// fake that RECORDS the arguments it was called with and RETURNS recorded
// fixtures, so each test asserts the real input-mapping (what the SDK was asked
// to do) and the real result-shaping (text + structuredContent), not a mock
// echoing what it was told.

const here = path.dirname(fileURLToPath(import.meta.url))
const load = (name: string): unknown =>
  JSON.parse(readFileSync(path.join(here, 'fixtures', name), 'utf8'))

interface DocCall {
  document: unknown
  options: unknown
}

interface Recorder {
  client: BeliqClient
  validateCalls: DocCall[]
  parseCalls: DocCall[]
  generateCalls: GenerateInput[]
  convertCalls: DocCall[]
}

const GENERATED_XML = '<rsm:CrossIndustryInvoice>generated</rsm:CrossIndustryInvoice>'
const CONVERTED_XML = '<Invoice>converted</Invoice>'
const GENERATED_VALIDATION = {
  valid: true,
  format: 'cii',
  errors: [],
  warnings: [],
  schematronVersion: 'XRechnung-2.5.0',
} as unknown as ValidationResult

function recordingClient(): Recorder {
  const validateCalls: DocCall[] = []
  const parseCalls: DocCall[] = []
  const generateCalls: GenerateInput[] = []
  const convertCalls: DocCall[] = []
  const client: BeliqClient = {
    async validate(document, options) {
      validateCalls.push({ document, options })
      return load('validate-invalid.json') as ValidationResult
    },
    async parse(document, options) {
      parseCalls.push({ document, options })
      return load('parse-result.json') as ParseResult
    },
    async generate(input): Promise<GenerateResult> {
      generateCalls.push(input)
      if (input.output === 'pdf') {
        return {
          contentType: 'application/pdf',
          bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
          sha256: 'pdf-sha256',
          validationResult: GENERATED_VALIDATION,
          meta: { schematronVersion: 'XRechnung-2.5.0', pdfKind: 'hybrid', rulesetSha256: 'ruleset-1', livemode: false },
        }
      }
      return {
        contentType: 'application/xml',
        bytes: Buffer.from(GENERATED_XML, 'utf8'),
        xml: GENERATED_XML,
        sha256: 'xml-sha256',
        validationResult: GENERATED_VALIDATION,
        meta: { schematronVersion: 'XRechnung-2.5.0', rulesetSha256: 'ruleset-1', livemode: false },
      }
    },
    async convert(document, options): Promise<ConvertResult> {
      convertCalls.push({ document, options })
      if (options.targetFormat === 'facturx' || options.targetFormat === 'zugferd') {
        return {
          contentType: 'application/pdf',
          bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]),
          meta: { sourceFormat: 'cii', targetFormat: options.targetFormat, profileDetected: 'en16931' },
        }
      }
      return {
        contentType: 'application/xml',
        bytes: Buffer.from(CONVERTED_XML, 'utf8'),
        meta: {
          sourceFormat: 'cii',
          targetFormat: options.targetFormat,
          lostElementsCount: 2,
          lostElements: ['ram:Foo', 'ram:Bar'],
        },
      }
    },
    async me() {
      return load('account.json') as AccountInfo
    },
  }
  return { client, validateCalls, parseCalls, generateCalls, convertCalls }
}

async function connect(client: BeliqClient): Promise<Client> {
  const server = new McpServer({ name: 'beliq-mcp', version: 'test' })
  registerAllTools(server, { client })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const c = new Client({ name: 'test-client', version: 'test' })
  await Promise.all([server.connect(serverTransport), c.connect(clientTransport)])
  return c
}

function textOf(res: { content: unknown }): string {
  return (res.content as Array<{ type: string; text?: string }>).map((c) => c.text ?? '').join('\n')
}

const MINIMAL_INVOICE = {
  number: 'INV-2026-001',
  issueDate: '2026-01-15',
  currencyCode: 'EUR',
  seller: { name: 'Seller GmbH', address: { city: 'Berlin', postalCode: '10115', countryCode: 'DE' } },
  buyer: { name: 'Buyer GmbH', address: { city: 'Munich', postalCode: '80331', countryCode: 'DE' } },
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

let tmpDir: string
beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'beliq-mcp-'))
})
afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('beliq MCP server (in-memory round-trip)', () => {
  it('advertises exactly the validate, parse, generate, convert, and check-account tools', async () => {
    const { client } = recordingClient()
    const c = await connect(client)
    const { tools } = await c.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      'beliq_check_account',
      'beliq_convert_einvoice',
      'beliq_generate_einvoice',
      'beliq_parse_einvoice',
      'beliq_validate_einvoice',
    ])
    await c.close()
  })

  it('maps inline document + options onto the validate call and shapes the result', async () => {
    const { client, validateCalls } = recordingClient()
    const c = await connect(client)
    const res = await c.callTool({
      name: 'beliq_validate_einvoice',
      arguments: { document: '<rsm:CrossIndustryInvoice/>', format: 'cii', franceCtc: true },
    })

    expect(res.isError).toBeFalsy()
    expect(validateCalls).toHaveLength(1)
    expect(validateCalls[0].document).toBe('<rsm:CrossIndustryInvoice/>')
    expect(validateCalls[0].options).toEqual({ format: 'cii', franceCtc: true })

    const sc = res.structuredContent as Record<string, unknown>
    expect(sc.valid).toBe(false)
    expect(sc.format).toBe('cii')
    expect(sc.errorCount).toBe(1)
    expect(sc.warningCount).toBe(1)
    expect((sc.errors as Array<{ ruleId: string }>)[0].ruleId).toBe('BR-DE-15')

    const text = textOf(res)
    expect(text).toContain('INVALID')
    expect(text).toContain('BR-DE-15')
    await c.close()
  })

  it('reads documentPath from disk and forwards the file bytes to validate', async () => {
    const { client, validateCalls } = recordingClient()
    const c = await connect(client)
    const xml = '<rsm:CrossIndustryInvoice>on-disk</rsm:CrossIndustryInvoice>'
    const filePath = path.join(tmpDir, 'invoice.xml')
    await writeFile(filePath, xml, 'utf8')

    const res = await c.callTool({
      name: 'beliq_validate_einvoice',
      arguments: { documentPath: filePath },
    })

    expect(res.isError).toBeFalsy()
    expect(validateCalls).toHaveLength(1)
    const sent = validateCalls[0].document
    expect(Buffer.isBuffer(sent)).toBe(true)
    expect(Buffer.from(sent as Uint8Array).toString('utf8')).toBe(xml)
    await c.close()
  })

  it('rejects a validate call that supplies neither document nor documentPath', async () => {
    const { client, validateCalls } = recordingClient()
    const c = await connect(client)
    const res = await c.callTool({ name: 'beliq_validate_einvoice', arguments: {} })
    expect(res.isError).toBe(true)
    expect(textOf(res)).toMatch(/exactly one of document/i)
    expect(validateCalls).toHaveLength(0)
    await c.close()
  })

  it('rejects a validate input that violates the schema (unknown format)', async () => {
    const { client } = recordingClient()
    const c = await connect(client)
    const res = await c.callTool({
      name: 'beliq_validate_einvoice',
      arguments: { document: '<x/>', format: 'bogus' },
    })
    expect(res.isError).toBe(true)
    await c.close()
  })

  it('parses an inline document and returns the structured invoice', async () => {
    const { client, parseCalls } = recordingClient()
    const c = await connect(client)
    const res = await c.callTool({
      name: 'beliq_parse_einvoice',
      arguments: { document: '<rsm:CrossIndustryInvoice/>', format: 'cii' },
    })

    expect(res.isError).toBeFalsy()
    expect(parseCalls).toHaveLength(1)
    expect(parseCalls[0].document).toBe('<rsm:CrossIndustryInvoice/>')
    expect(parseCalls[0].options).toEqual({ format: 'cii' })

    const sc = res.structuredContent as Record<string, unknown>
    expect(sc.format).toBe('cii')
    expect(sc.profileDetected).toBe('xrechnung')
    expect((sc.invoice as { number: string }).number).toBe('INV-2026-001')

    expect(textOf(res)).toContain('Parsed a cii')
    expect(textOf(res)).toContain('INV-2026-001')
    await c.close()
  })

  it('generates XML inline and defaults verify to true', async () => {
    const { client, generateCalls } = recordingClient()
    const c = await connect(client)
    const res = await c.callTool({
      name: 'beliq_generate_einvoice',
      arguments: { standard: 'xrechnung', invoice: MINIMAL_INVOICE },
    })

    expect(res.isError).toBeFalsy()
    expect(generateCalls).toHaveLength(1)
    expect(generateCalls[0].standard).toBe('xrechnung')
    expect(generateCalls[0].output).toBe('xml')
    expect(generateCalls[0].verify).toBe(true)
    // Always sealed so the seal (sha256 + verdict) is available to cite.
    expect(generateCalls[0].seal).toBe(true)
    expect(generateCalls[0].invoice.number).toBe('INV-2026-001')

    const sc = res.structuredContent as Record<string, unknown>
    expect(sc.output).toBe('xml')
    expect(sc.xml).toBe(GENERATED_XML)
    expect(sc.outputPath).toBeUndefined()
    expect(sc.sha256).toBe('xml-sha256')
    expect(sc.rulesetSha256).toBe('ruleset-1')
    expect(sc.livemode).toBe(false)
    expect((sc.validationResult as { valid: boolean }).valid).toBe(true)
    expect(textOf(res)).toContain(GENERATED_XML)
    expect(textOf(res)).toContain('sha256 xml-sha256')
    await c.close()
  })

  it('preserves invoice fields not in the schema shape (passthrough)', async () => {
    const { client, generateCalls } = recordingClient()
    const c = await connect(client)
    const res = await c.callTool({
      name: 'beliq_generate_einvoice',
      arguments: {
        standard: 'xrechnung',
        invoice: { ...MINIMAL_INVOICE, dueDate: '2026-02-15', buyerReference: 'PO-42' },
      },
    })

    expect(res.isError).toBeFalsy()
    const sent = generateCalls[0].invoice as unknown as Record<string, unknown>
    expect(sent.dueDate).toBe('2026-02-15')
    expect(sent.buyerReference).toBe('PO-42')
    await c.close()
  })

  it('writes a generated PDF to outputPath and reports the path', async () => {
    const { client, generateCalls } = recordingClient()
    const c = await connect(client)
    const outPath = path.join(tmpDir, 'invoice.pdf')
    const res = await c.callTool({
      name: 'beliq_generate_einvoice',
      arguments: { standard: 'facturx', output: 'pdf', outputPath: outPath, invoice: MINIMAL_INVOICE },
    })

    expect(res.isError).toBeFalsy()
    expect(generateCalls[0].output).toBe('pdf')

    const sc = res.structuredContent as Record<string, unknown>
    expect(sc.output).toBe('pdf')
    expect(sc.outputPath).toBe(outPath)
    expect(sc.bytesWritten).toBe(5)
    expect(sc.xml).toBeUndefined()

    const written = await readFile(outPath)
    expect(written.length).toBe(5)
    expect(written[0]).toBe(0x25) // '%', the start of a PDF header
    expect(textOf(res)).toContain('Written to')
    await c.close()
  })

  it('rejects a PDF generate that omits outputPath, before calling the API', async () => {
    const { client, generateCalls } = recordingClient()
    const c = await connect(client)
    const res = await c.callTool({
      name: 'beliq_generate_einvoice',
      arguments: { standard: 'facturx', output: 'pdf', invoice: MINIMAL_INVOICE },
    })
    expect(res.isError).toBe(true)
    expect(textOf(res)).toMatch(/outputPath/)
    expect(generateCalls).toHaveLength(0)
    await c.close()
  })

  it('refuses to overwrite an existing file at outputPath', async () => {
    const { client } = recordingClient()
    const c = await connect(client)
    const outPath = path.join(tmpDir, 'exists.xml')
    await writeFile(outPath, 'keep me', 'utf8')

    const res = await c.callTool({
      name: 'beliq_generate_einvoice',
      arguments: { standard: 'xrechnung', outputPath: outPath, invoice: MINIMAL_INVOICE },
    })
    expect(res.isError).toBe(true)
    expect(textOf(res)).toMatch(/already exists/)
    // The existing file is left untouched.
    expect(await readFile(outPath, 'utf8')).toBe('keep me')
    await c.close()
  })

  it('rejects a generate for a provisional standard withheld from the public set', async () => {
    const { client, generateCalls } = recordingClient()
    const c = await connect(client)
    const res = await c.callTool({
      name: 'beliq_generate_einvoice',
      arguments: { standard: 'fatturapa', invoice: MINIMAL_INVOICE },
    })
    expect(res.isError).toBe(true)
    expect(generateCalls).toHaveLength(0)
    await c.close()
  })

  it('surfaces an API error from generate as a tool error the model can act on', async () => {
    const client: BeliqClient = {
      validate: async () => load('validate-invalid.json') as ValidationResult,
      parse: async () => load('parse-result.json') as ParseResult,
      me: async () => load('account.json') as AccountInfo,
      convert: async () => {
        throw new Error('unused')
      },
      generate: async () => {
        throw new BeliqApiError('Invoice failed validation', { status: 422, code: 'INVALID_INVOICE' })
      },
    }
    const c = await connect(client)
    const res = await c.callTool({
      name: 'beliq_generate_einvoice',
      arguments: { standard: 'xrechnung', invoice: MINIMAL_INVOICE },
    })
    expect(res.isError).toBe(true)
    expect(textOf(res)).toMatch(/422/)
    expect(textOf(res)).toMatch(/INVALID_INVOICE/)
    await c.close()
  })

  it('converts an inline document to an XML target and reports lost elements inline', async () => {
    const { client, convertCalls } = recordingClient()
    const c = await connect(client)
    const res = await c.callTool({
      name: 'beliq_convert_einvoice',
      arguments: { document: '<rsm:CrossIndustryInvoice/>', targetFormat: 'ubl', sourceFormat: 'cii' },
    })

    expect(res.isError).toBeFalsy()
    expect(convertCalls).toHaveLength(1)
    expect(convertCalls[0].document).toBe('<rsm:CrossIndustryInvoice/>')
    expect(convertCalls[0].options).toMatchObject({ targetFormat: 'ubl', sourceFormat: 'cii' })

    const sc = res.structuredContent as Record<string, unknown>
    expect(sc.output).toBe('xml')
    expect(sc.targetFormat).toBe('ubl')
    expect(sc.xml).toBe(CONVERTED_XML)
    expect(sc.lostElementsCount).toBe(2)
    expect(sc.lostElements).toEqual(['ram:Foo', 'ram:Bar'])
    expect(sc.outputPath).toBeUndefined()

    const text = textOf(res)
    expect(text).toContain('Converted cii to ubl')
    expect(text).toContain('2 elements could not be carried across')
    expect(text).toContain(CONVERTED_XML)
    await c.close()
  })

  it('writes a converted PDF to outputPath for a facturx target', async () => {
    const { client, convertCalls } = recordingClient()
    const c = await connect(client)
    const srcPath = path.join(tmpDir, 'src.xml')
    await writeFile(srcPath, '<Invoice/>', 'utf8')
    const outPath = path.join(tmpDir, 'converted.pdf')
    const res = await c.callTool({
      name: 'beliq_convert_einvoice',
      arguments: { documentPath: srcPath, targetFormat: 'facturx', outputPath: outPath },
    })

    expect(res.isError).toBeFalsy()
    expect(convertCalls[0].options).toMatchObject({ targetFormat: 'facturx' })

    const sc = res.structuredContent as Record<string, unknown>
    expect(sc.output).toBe('pdf')
    expect(sc.outputPath).toBe(outPath)
    expect(sc.bytesWritten).toBe(5)
    expect(sc.xml).toBeUndefined()

    const written = await readFile(outPath)
    expect(written.length).toBe(5)
    expect(written[0]).toBe(0x25) // '%', the start of a PDF header
    expect(textOf(res)).toContain('Written to')
    await c.close()
  })

  it('rejects a PDF-target convert that omits outputPath, before calling the API', async () => {
    const { client, convertCalls } = recordingClient()
    const c = await connect(client)
    const res = await c.callTool({
      name: 'beliq_convert_einvoice',
      arguments: { document: '<Invoice/>', targetFormat: 'zugferd' },
    })
    expect(res.isError).toBe(true)
    expect(textOf(res)).toMatch(/outputPath/)
    expect(convertCalls).toHaveLength(0)
    await c.close()
  })

  it('rejects a convert to a provisional target withheld from the public set', async () => {
    const { client, convertCalls } = recordingClient()
    const c = await connect(client)
    const res = await c.callTool({
      name: 'beliq_convert_einvoice',
      arguments: { document: '<Invoice/>', targetFormat: 'fatturapa' },
    })
    expect(res.isError).toBe(true)
    expect(convertCalls).toHaveLength(0)
    await c.close()
  })

  it('check_account reports a valid key with plan and quota', async () => {
    const { client } = recordingClient()
    const c = await connect(client)
    const res = await c.callTool({ name: 'beliq_check_account', arguments: {} })
    const sc = res.structuredContent as Record<string, unknown>
    expect(sc.ok).toBe(true)
    expect(sc.status).toBe(200)
    expect(sc.plan).toBe('Growth')
    expect(textOf(res)).toContain('9863 remaining')
    await c.close()
  })

  it('check_account reports a rejected key as ok:false on a 401', async () => {
    const client: BeliqClient = {
      validate: async () => {
        throw new Error('unused')
      },
      parse: async () => {
        throw new Error('unused')
      },
      generate: async () => {
        throw new Error('unused')
      },
      convert: async () => {
        throw new Error('unused')
      },
      me: async () => {
        throw new BeliqApiError('Unauthorized', { status: 401, code: 'invalid_api_key' })
      },
    }
    const c = await connect(client)
    const res = await c.callTool({ name: 'beliq_check_account', arguments: {} })
    const sc = res.structuredContent as Record<string, unknown>
    expect(sc.ok).toBe(false)
    expect(sc.status).toBe(401)
    expect(textOf(res)).toMatch(/401/)
    await c.close()
  })
})
