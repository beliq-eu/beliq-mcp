import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { summarizeValidation } from '../src/summary.js'
import type { ValidationResult } from '@beliq/sdk'

const here = path.dirname(fileURLToPath(import.meta.url))
function fixture(name: string): ValidationResult {
  return JSON.parse(readFileSync(path.join(here, 'fixtures', name), 'utf8')) as ValidationResult
}

describe('summarizeValidation', () => {
  it('reports an invalid verdict with format, profile, ruleset, and counts', () => {
    const text = summarizeValidation(fixture('validate-invalid.json'))
    expect(text).toContain('Validation: INVALID.')
    expect(text).toContain('Format cii (profile xrechnung)')
    expect(text).toContain('checked against Schematron 1.3.16')
    expect(text).toContain('1 error, 1 warning.')
    // Both the error and the warning are spelled out, with rule id and location.
    expect(text).toContain('- BR-DE-15 (error) at /rsm:CrossIndustryInvoice: ')
    expect(text).toContain('- BR-CL-25 (warning): ')
  })

  it('reports a valid verdict and still lists warnings', () => {
    const text = summarizeValidation(fixture('validate-valid.json'))
    expect(text).toContain('Validation: VALID.')
    expect(text).toContain('0 errors, 1 warning.')
    expect(text).toContain('- PEPPOL-EN16931-R053 (warning)')
    // No "Errors:" section when there are none.
    expect(text).not.toContain('Errors:')
  })

  it('caps the listed issues and reports how many were collapsed', () => {
    const errors = Array.from({ length: 25 }, (_, i) => ({
      ruleId: `BR-${i + 1}`,
      severity: 'error',
      message: `problem ${i + 1}`,
    }))
    const result = {
      valid: false,
      format: 'cii',
      errors,
      warnings: [],
    } as unknown as ValidationResult

    const text = summarizeValidation(result)
    expect(text).toContain('25 errors, 0 warnings.')
    expect(text).toContain('- BR-20 (error): problem 20')
    expect(text).not.toContain('- BR-21 (error)')
    expect(text).toContain('... and 5 more.')
  })

  it('omits the profile and ruleset clauses when absent', () => {
    const result = {
      valid: true,
      format: 'ubl',
      errors: [],
      warnings: [],
    } as unknown as ValidationResult
    const text = summarizeValidation(result)
    expect(text).toBe('Validation: VALID. Format ubl. 0 errors, 0 warnings.')
  })
})
