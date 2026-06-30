import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { BeliqApiError } from '@beliq/sdk'
import type { AccountInfo, ValidationResult } from '@beliq/sdk'
import { registerAllTools } from '../src/tools/register.js'
import type { BeliqClient } from '../src/deps.js'

// A full MCP round-trip over an in-memory transport. The injected client is a
// fake that RECORDS the arguments it was called with and RETURNS recorded
// fixtures, so each test asserts the real input-mapping (what the SDK was asked
// to validate) and the real result-shaping (text + structuredContent), not a
// mock echoing what it was told.

const here = path.dirname(fileURLToPath(import.meta.url))
const load = (name: string): unknown =>
  JSON.parse(readFileSync(path.join(here, 'fixtures', name), 'utf8'))

interface RecordedCall {
  document: unknown
  options: unknown
}

function recordingClient(): { client: BeliqClient; calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  const client: BeliqClient = {
    async validate(document, options) {
      calls.push({ document, options })
      return load('validate-invalid.json') as ValidationResult
    },
    async me() {
      return load('account.json') as AccountInfo
    },
  }
  return { client, calls }
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

let tmpDir: string
beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'beliq-mcp-'))
})
afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('beliq MCP server (in-memory round-trip)', () => {
  it('advertises exactly the validate and check-account tools', async () => {
    const { client } = recordingClient()
    const c = await connect(client)
    const { tools } = await c.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['beliq_check_account', 'beliq_validate_einvoice'])
    await c.close()
  })

  it('maps inline document + options onto the SDK call and shapes the result', async () => {
    const { client, calls } = recordingClient()
    const c = await connect(client)
    const res = await c.callTool({
      name: 'beliq_validate_einvoice',
      arguments: { document: '<rsm:CrossIndustryInvoice/>', format: 'cii', franceCtc: true },
    })

    expect(res.isError).toBeFalsy()
    expect(calls).toHaveLength(1)
    expect(calls[0].document).toBe('<rsm:CrossIndustryInvoice/>')
    expect(calls[0].options).toEqual({ format: 'cii', franceCtc: true })

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

  it('reads documentPath from disk and forwards the file bytes to the SDK', async () => {
    const { client, calls } = recordingClient()
    const c = await connect(client)
    const xml = '<rsm:CrossIndustryInvoice>on-disk</rsm:CrossIndustryInvoice>'
    const filePath = path.join(tmpDir, 'invoice.xml')
    await writeFile(filePath, xml, 'utf8')

    const res = await c.callTool({
      name: 'beliq_validate_einvoice',
      arguments: { documentPath: filePath },
    })

    expect(res.isError).toBeFalsy()
    expect(calls).toHaveLength(1)
    const sent = calls[0].document
    expect(Buffer.isBuffer(sent)).toBe(true)
    expect(Buffer.from(sent as Uint8Array).toString('utf8')).toBe(xml)
    await c.close()
  })

  it('rejects a call that supplies neither document nor documentPath', async () => {
    const { client, calls } = recordingClient()
    const c = await connect(client)
    const res = await c.callTool({ name: 'beliq_validate_einvoice', arguments: {} })
    expect(res.isError).toBe(true)
    expect(textOf(res)).toMatch(/exactly one of document/i)
    expect(calls).toHaveLength(0)
    await c.close()
  })

  it('rejects an input that violates the schema (unknown format)', async () => {
    const { client } = recordingClient()
    const c = await connect(client)
    const res = await c.callTool({
      name: 'beliq_validate_einvoice',
      arguments: { document: '<x/>', format: 'bogus' },
    })
    expect(res.isError).toBe(true)
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
