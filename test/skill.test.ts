import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { parse } from 'yaml'

// People copy skill/SKILL.md into their own agent's skill folder, and GitHub
// and some agents read its frontmatter as strict YAML. An unquoted ": " inside
// a value is a syntax error there, even where a lenient loader accepts it.

const here = path.dirname(fileURLToPath(import.meta.url))
const skill = readFileSync(path.join(here, '..', 'skill', 'SKILL.md'), 'utf8')

describe('skill/SKILL.md', () => {
  it('has frontmatter that parses as strict YAML, with a name and a description', () => {
    const match = /^---\n([\s\S]*?)\n---\n/.exec(skill)
    if (!match) throw new Error('skill/SKILL.md does not start with a --- frontmatter block')
    const frontmatter: unknown = parse(match[1])
    expect(frontmatter).toMatchObject({
      name: 'beliq-validate-einvoice',
      description: expect.stringContaining('EU electronic invoice'),
    })
  })
})
