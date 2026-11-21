import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// manifest.json is the MCPB bundle's manifest. The release job packs it with
// the npm version of the same tag, so it has to describe that package.

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (file: string) => JSON.parse(readFileSync(path.join(here, '..', file), 'utf8'))
const pkg = read('package.json')
const server = read('server.json')
const manifest = read('manifest.json')

interface ServerEnvVar {
  name: string
  isRequired?: boolean
}

describe('manifest.json', () => {
  it('is the package at the package.json version', () => {
    expect(manifest.name).toBe(pkg.name)
    expect(manifest.version).toBe(pkg.version)
  })

  it('runs the file npm runs as the beliq-mcp command', () => {
    expect(manifest.server.entry_point).toBe(pkg.bin['beliq-mcp'])
    expect(manifest.server.mcp_config.args).toEqual([`\${__dirname}/${pkg.bin['beliq-mcp']}`])
  })

  it('has the description the MCP Registry lists', () => {
    expect(manifest.description).toBe(server.description)
  })

  it('asks the user for every variable the registry marks required, and sets no other', () => {
    const vars: ServerEnvVar[] = server.packages[0].environmentVariables
    const required = vars.filter((v) => v.isRequired).map((v) => v.name)
    const env: Record<string, string> = manifest.server.mcp_config.env
    expect(Object.keys(env).sort()).toEqual(required.sort())
    for (const value of Object.values(env)) {
      const key = /^\$\{user_config\.(\w+)\}$/.exec(value)?.[1]
      expect(key && manifest.user_config[key]).toMatchObject({ required: true, sensitive: true })
    }
  })
})
