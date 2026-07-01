import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerDeps } from '../deps.js'
import { convertInputShape, convertOutputShape, type ConvertInput } from '../schema.js'
import { runConvert } from './shared.js'

const description = [
  'Convert an EU electronic invoice from one EN 16931 format to another.',
  'Pass the source document (inline via document, or a file via documentPath) and set targetFormat to cii, ubl, xrechnung, peppol-bis, facturx, or zugferd.',
  'An XML target (cii, ubl, xrechnung, peppol-bis) comes back inline; a PDF target (facturx, zugferd) is written to the outputPath you give.',
  'The result reports any elements the conversion could not carry across, so a lossy conversion is visible rather than silent.',
  'beliq produces the converted document; transmission (Peppol, PDP, KSeF, SDI), archiving, and tax-authority reporting stay with your access point.',
].join(' ')

export function registerConvert(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    'beliq_convert_einvoice',
    {
      title: 'beliq: Convert E-Invoice',
      description,
      inputSchema: convertInputShape,
      outputSchema: convertOutputShape,
      annotations: {
        title: 'beliq: Convert E-Invoice',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => runConvert(args as ConvertInput, deps)
  )
}
