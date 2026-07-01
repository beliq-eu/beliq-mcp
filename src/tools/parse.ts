import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerDeps } from '../deps.js'
import { parseInputShape, parseOutputShape, type ParseInput } from '../schema.js'
import { runParse } from './shared.js'

const description = [
  'Parse an EU electronic invoice into a structured EN 16931 invoice object.',
  'Accepts a UBL or CII XML document (inline via document, or a file via documentPath), or a Factur-X / ZUGFeRD PDF via documentPath.',
  'Returns the detected format and profile and the extracted invoice (number, dates, currency, seller, buyer, lines, totals, and more).',
  'Use it to read the contents of an invoice; use validate to check compliance.',
].join(' ')

export function registerParse(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    'beliq_parse_einvoice',
    {
      title: 'beliq: Parse E-Invoice',
      description,
      inputSchema: parseInputShape,
      outputSchema: parseOutputShape,
      annotations: {
        title: 'beliq: Parse E-Invoice',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => runParse(args as ParseInput, deps)
  )
}
