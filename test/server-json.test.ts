import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// The release job lists the npm version it just published in the MCP Registry,
// which accepts it only when server.json and the published package.json agree.
// A mismatch found there comes after npm already holds a version that cannot be
// listed, so it is caught here, on the pull request.

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (file: string) => JSON.parse(readFileSync(path.join(here, '..', file), 'utf8'))
const pkg = read('package.json')
const server = read('server.json')

// docs/reference/server-json/draft/server.schema.json in modelcontextprotocol/registry
const MAX_DESCRIPTION_LENGTH = 100

describe('server.json', () => {
  it('is named as package.json mcpName, the registry ownership check', () => {
    expect(server.name).toBe(pkg.mcpName)
  })

  it('names one npm package, this one, at the package.json version', () => {
    expect(server.packages).toHaveLength(1)
    expect(server.packages[0]).toMatchObject({
      registryType: 'npm',
      identifier: pkg.name,
      version: pkg.version,
    })
    expect(server.version).toBe(pkg.version)
  })

  it('has a description the registry accepts', () => {
    expect(server.description.length).toBeGreaterThan(0)
    expect(server.description.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH)
  })
})
