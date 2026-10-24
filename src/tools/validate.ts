import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerDeps } from '../deps.js'
import { validateInputShape, validateOutputShape, type ValidateInput } from '../schema.js'
import { runValidate } from './shared.js'

const description = [
  'Validate an EU electronic invoice and report the verdict together with how deep the check went.',
  'Accepts an invoice XML document (inline via document, or a file via documentPath), or a Factur-X / ZUGFeRD PDF via documentPath. For a PDF the verdict is about the embedded XML: the PDF itself is not checked, and pdfInput says which embedded file was read.',
  'Returns valid, the detected format and profile, the check depth in verificationBadgeLabel, the ruleset versions the check ran, and every error and warning with its rule id, severity, location, and message.',
  'valid means the document passed the rule packs and schemas beliq runs for its format, in the versions the result names. It does not mean every recipient, validation tool or tax authority accepts it.',
  'Report the check depth beside the verdict, in the words of verificationBadgeLabel. When that field is absent, say the check depth was not stated and name none.',
  'When the result carries franceCtcBlockingRuleIds, lead with them: the API reports those French CTC rule ids as ending a transmission through a French platform, also where valid is true.',
  'beliq validates the document; transmission (Peppol, plateforme agréée, KSeF, SDI), archiving, and tax-authority reporting stay with your access point.',
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
