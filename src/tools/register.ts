import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerDeps } from '../deps.js'
import { registerValidate } from './validate.js'
import { registerCheckAccount } from './checkAccount.js'

/** Register every beliq tool on the server with the given dependencies. */
export function registerAllTools(server: McpServer, deps: ServerDeps): void {
  registerValidate(server, deps)
  registerCheckAccount(server, deps)
}
