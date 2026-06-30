#!/usr/bin/env node
// On stdio, stdout carries the JSON-RPC protocol. All diagnostics MUST go to
// stderr; a stray console.log anywhere reachable from the running server
// corrupts the protocol stream.
import { createRequire } from 'node:module'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { Beliq } from '@beliq/sdk'
import { loadConfig } from './config.js'
import { registerAllTools } from './tools/register.js'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

async function main(): Promise<void> {
  let config
  try {
    config = loadConfig()
  } catch (err) {
    console.error(`[beliq-mcp] ${(err as Error).message}`)
    process.exit(1)
  }

  const client = new Beliq({ apiKey: config.apiKey, baseUrl: config.baseUrl, auth: config.auth })
  const server = new McpServer({ name: 'beliq-mcp', version })
  registerAllTools(server, { client })

  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(`[beliq-mcp] v${version} ready on stdio (base ${config.baseUrl})`)
}

main().catch((err) => {
  console.error('[beliq-mcp] fatal:', err)
  process.exit(1)
})
