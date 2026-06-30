import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerDeps } from '../deps.js'
import { validateInputShape, validateOutputShape, type ValidateInput } from '../schema.js'
import { runValidate } from './shared.js'

const description = [
  'Validate an EU electronic invoice against authority-pinned, drift-checked rules and report whether it is compliant.',
  'Accepts a UBL or CII XML document (inline via document, or a file via documentPath), or a Factur-X / ZUGFeRD PDF via documentPath.',
  'Returns the verdict (valid or not), the detected format and profile, the ruleset (Schematron) version it was checked against, and every error and warning with its rule id, severity, location, and message.',
  'beliq validates the compliant document; transmission (Peppol, PDP, KSeF, SDI), archiving, and tax-authority reporting stay with your access point.',
].join(' ')

export function registerValidate(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    'beliq_validate_einvoice',
    {
      title: 'beliq: Validate E-Invoice',
      description,
      inputSchema: validateInputShape,
      outputSchema: validateOutputShape,
      annotations: {
        title: 'beliq: Validate E-Invoice',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => runValidate(args as ValidateInput, deps)
  )
}
