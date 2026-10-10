import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerDeps } from '../deps.js'
import { convertInputShape, convertOutputShape, type ConvertInput } from '../schema.js'
import { runConvert } from './shared.js'

const description = [
  'Convert an EU electronic invoice from one EN 16931 format to another.',
  'Pass the source document (inline via document, or a file via documentPath) and set targetFormat.',
  'The converted document comes back as XML inline for every target, facturx and zugferd included: an XML source is not wrapped into a hybrid PDF. A PDF comes back only when a hybrid PDF source already is the target, and is then written to the outputPath you give.',
  'A successful result means the API validated the converted XML before returning it. For a facturx or zugferd target at profile en16931 that validation is the one for plain EN 16931 CII: no Factur-X profile schema is checked. It carries no verdict and no check depth; a converted document that fails comes back as an error that lists the failed rules.',
  'lostElementsCount is how many source elements the engine recorded as having no target equivalent. A loss the engine does not detect is not counted, so 0 does not say that every field of the source arrived.',
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
