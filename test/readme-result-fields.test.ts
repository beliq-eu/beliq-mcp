import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { convertOutputShape, generateOutputShape } from '../src/schema.js'

// The README ships in the npm tarball, and its "Reading a result" section is
// where a client author learns the structured fields. A field added to an
// output schema has to be named there, and a bullet there has to lead with a
// field the schema still declares, so the two cannot drift apart silently.

const here = path.dirname(fileURLToPath(import.meta.url))
const readme = readFileSync(path.join(here, '..', 'README.md'), 'utf8')

/** The README block that starts with "`<tool>` returns", up to the next tool's block or heading. */
function resultBlock(tool: string): string[] {
  const lines = readme.split('\n')
  const start = lines.findIndex((line) => line.startsWith(`\`${tool}\` returns`))
  if (start === -1) throw new Error(`README.md has no paragraph starting "\`${tool}\` returns"`)
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith('`beliq_') || line.startsWith('#'))
  return end === -1 ? lines.slice(start) : lines.slice(start, start + 1 + end)
}

const codeSpans = (text: string): string[] => [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1])

describe.each([
  ['beliq_generate_einvoice', generateOutputShape],
  ['beliq_convert_einvoice', convertOutputShape],
] as const)('README result fields for %s', (tool, shape) => {
  const block = resultBlock(tool)
  const keys = Object.keys(shape)

  it('names every field the output schema declares', () => {
    const named = new Set(codeSpans(block.join('\n')))
    expect(keys.filter((key) => !named.has(key))).toEqual([])
  })

  it('leads each bullet with a field the output schema declares', () => {
    const leads = block.filter((line) => line.startsWith('- ')).map((line) => codeSpans(line)[0])
    expect(leads.length).toBeGreaterThan(0)
    expect(leads.filter((lead) => !keys.includes(lead))).toEqual([])
  })
})
