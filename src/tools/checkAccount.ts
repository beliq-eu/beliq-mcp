import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerDeps } from '../deps.js'
import { checkAccountOutputShape } from '../schema.js'
import { runCheckAccount } from './shared.js'

export function registerCheckAccount(server: McpServer, deps: ServerDeps): void {
  server.registerTool(
    'beliq_check_account',
    {
      title: 'beliq: Check Account',
      description:
        'Verify the configured beliq API key and report the plan and remaining quota. Calls GET /v1/me, which draws no quota. Use it as a connection and credential smoke test.',
      inputSchema: {},
      outputSchema: checkAccountOutputShape,
      annotations: {
        title: 'beliq: Check Account',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => runCheckAccount(deps)
  )
}
