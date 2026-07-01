import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ServerDeps } from '../deps.js'
import { registerValidate } from './validate.js'
import { registerCheckAccount } from './checkAccount.js'
import { registerParse } from './parse.js'
import { registerGenerate } from './generate.js'
import { registerConvert } from './convert.js'

/** Register every beliq tool on the server with the given dependencies. */
export function registerAllTools(server: McpServer, deps: ServerDeps): void {
  registerValidate(server, deps)
  registerParse(server, deps)
  registerGenerate(server, deps)
  registerConvert(server, deps)
  registerCheckAccount(server, deps)
}
