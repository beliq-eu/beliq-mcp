import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerDeps } from '../deps.js'
import { generateInputShape, generateOutputShape, type GenerateInput } from '../schema.js'
import { runGenerate } from './shared.js'

const description = [
  'Generate an EU electronic invoice from an EN 16931 invoice object.',
  'Set standard to the target format and pass the invoice fields.',
  'Use only invoice data the user gave. When a field the target format requires is missing, ask the user for it: do not make up a value so that validation passes.',
  "output 'xml' (default) returns the document inline; 'pdf' needs outputPath to write it to, and is a hybrid PDF/A-3 with the XML embedded for facturx and zugferd, or a visualization with no embedded XML for xrechnung and peppol-bis (whose legal document stays the XML).",
  'By default the API validates the document before returning it (verify), and a document that fails comes back as an error that lists the failed rules. validationResult carries the verdict, with the check depth of that validation in verificationBadgeLabel.',
  'beliq produces the document; transmission (Peppol, PDP, KSeF, SDI), archiving, and tax-authority reporting stay with your access point.',
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
