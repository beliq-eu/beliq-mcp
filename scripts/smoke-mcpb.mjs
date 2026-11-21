// Starts the server from an unpacked MCPB bundle the way the manifest tells a
// client to, and checks that it lists the same tools as the build in dist/.
// Unpack the bundle outside this repo: inside it, Node would resolve a
// dependency the bundle lacks from this repo's node_modules, and the check
// would pass on a broken bundle.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const bundleDir = process.argv[2]
if (!bundleDir) {
  console.error('usage: node scripts/smoke-mcpb.mjs <unpacked bundle directory>')
  process.exit(2)
}

// Any non-empty key: listing tools makes no API call.
const env = { PATH: process.env.PATH ?? '', BELIQ_API_KEY: 'smoke-test-key' }

async function toolNames(command, args) {
  const client = new Client({ name: 'mcpb-smoke', version: '0.0.0' })
  await client.connect(new StdioClientTransport({ command, args, env, stderr: 'inherit' }))
  try {
    const { tools } = await client.listTools()
    return tools.map((t) => t.name).sort()
  } finally {
    await client.close()
  }
}

const manifest = JSON.parse(readFileSync(path.join(bundleDir, 'manifest.json'), 'utf8'))
const { command, args } = manifest.server.mcp_config
if (command !== 'node') throw new Error(`manifest runs ${command}, this check knows only node`)
const bundled = await toolNames(
  process.execPath,
  args.map((a) => a.replaceAll('${__dirname}', path.resolve(bundleDir))),
)
const built = await toolNames(process.execPath, [path.resolve('dist/index.js')])

if (bundled.length === 0 || JSON.stringify(bundled) !== JSON.stringify(built)) {
  console.error(`bundle lists [${bundled.join(', ')}], dist/ lists [${built.join(', ')}]`)
  process.exit(1)
}
console.log(`bundle lists the ${bundled.length} tools of dist/: ${bundled.join(', ')}`)
