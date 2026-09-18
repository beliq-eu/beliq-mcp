import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerDeps } from '../deps.js'
import { generateInputShape, generateOutputShape, type GenerateInput } from '../schema.js'
import { runGenerate } from './shared.js'

const description = [
  'Generate a compliant EU electronic invoice from an EN 16931 invoice object.',
  'Set standard to the target (xrechnung, zugferd, facturx, or peppol-bis) and pass the invoice fields.',
  "output 'xml' (default) returns the document inline; 'pdf' needs outputPath to write it to, and is a hybrid PDF/A-3 with the XML embedded for facturx and zugferd, or a visualization with no embedded XML for xrechnung and peppol-bis (whose legal document stays the XML).",
  'By default the result is validated before it is returned (verify), so a non-compliant document fails rather than coming back.',
  'beliq produces the compliant document; transmission (Peppol, PDP, KSeF, SDI), archiving, and tax-authority reporting stay with your access point.',
].join(' ')

export function registerGenerate(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    'beliq_generate_einvoice',
    {
      title: 'beliq: Generate E-Invoice',
      description,
      inputSchema: generateInputShape,
      outputSchema: generateOutputShape,
      annotations: {
        title: 'beliq: Generate E-Invoice',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => runGenerate(args as GenerateInput, deps)
  )
}
