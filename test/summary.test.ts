import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { summarizeConvert, summarizeGenerate, summarizeParse, summarizeValidation } from '../src/summary.js'
import type { ParseResult, ValidationResult } from '@beliq/sdk'

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

describe('summarizeParse', () => {
  it('reports the format, profile, invoice number, line count, and gross total', () => {
    const result = fixture('parse-result.json') as unknown as ParseResult
    const text = summarizeParse(result)
    expect(text).toBe('Parsed a cii (profile xrechnung) document: invoice INV-2026-001, 1 line, gross 1190 EUR.')
  })

  it('omits the profile clause when absent', () => {
    const result = {
      format: 'ubl',
      invoice: {
        number: 'X-1',
        currencyCode: 'EUR',
        lines: [{}, {}],
        totalGrossAmount: 240,
      },
    } as unknown as ParseResult
    expect(summarizeParse(result)).toBe('Parsed a ubl document: invoice X-1, 2 lines, gross 240 EUR.')
  })
})

describe('summarizeGenerate', () => {
  it('appends the full document for an XML result', () => {
    const xml = '<rsm:CrossIndustryInvoice>doc</rsm:CrossIndustryInvoice>'
    const text = summarizeGenerate({
      standard: 'xrechnung',
      output: 'xml',
      schematronVersion: 'XRechnung-2.5.0',
      xml,
    })
    expect(text).toContain('Generated a xrechnung xml document, checked against Schematron XRechnung-2.5.0.')
    expect(text).toContain(xml)
  })

  it('reports the written path and byte count for a PDF result', () => {
    const text = summarizeGenerate({
      standard: 'facturx',
      output: 'pdf',
      schematronVersion: 'Factur-X-1.0',
      outputPath: '/tmp/invoice.pdf',
      bytesWritten: 12345,
    })
    expect(text).toBe(
      'Generated a facturx pdf document, checked against Schematron Factur-X-1.0. Written to /tmp/invoice.pdf (12345 bytes).'
    )
  })

  it('notes when an XML result is also written to a path', () => {
    const text = summarizeGenerate({
      standard: 'xrechnung',
      output: 'xml',
      outputPath: '/tmp/out.xml',
      bytesWritten: 20,
      xml: '<x/>',
    })
    expect(text).toContain('Written to /tmp/out.xml.')
    expect(text).toContain('<x/>')
  })

  it('states the sha256 and verdict when the seal is present', () => {
    const text = summarizeGenerate({
      standard: 'xrechnung',
      output: 'xml',
      schematronVersion: 'XRechnung-2.5.0',
      sha256: 'deadbeef',
      valid: true,
      xml: '<x/>',
    })
    expect(text).toContain('Document sha256 deadbeef; validation passed.')
  })
})

describe('summarizeConvert', () => {
  it('reports source, target, and lost elements and appends the XML', () => {
    const xml = '<Invoice>converted</Invoice>'
    const text = summarizeConvert({
      output: 'xml',
      sourceFormat: 'cii',
      targetFormat: 'ubl',
      lostElementsCount: 2,
      xml,
    })
    expect(text).toContain('Converted cii to ubl.')
    expect(text).toContain('2 elements could not be carried across.')
    expect(text).toContain(xml)
  })

  it('reports the written path and byte count for a PDF target', () => {
    const text = summarizeConvert({
      output: 'pdf',
      sourceFormat: 'ubl',
      targetFormat: 'facturx',
      profileDetected: 'en16931',
      outputPath: '/tmp/out.pdf',
      bytesWritten: 2048,
    })
    expect(text).toBe(
      'Converted ubl to facturx (profile en16931). Written to /tmp/out.pdf (2048 bytes).'
    )
  })

  it('omits the lost-elements clause when nothing was lost', () => {
    const text = summarizeConvert({
      output: 'xml',
      sourceFormat: 'cii',
      targetFormat: 'ubl',
      lostElementsCount: 0,
      xml: '<x/>',
    })
    expect(text).toContain('Converted cii to ubl.')
    expect(text).not.toContain('carried across')
  })

  it('omits the source clause when the source format is unknown', () => {
    const text = summarizeConvert({ output: 'xml', targetFormat: 'ubl', xml: '<x/>' })
    expect(text).toContain('Converted to ubl.')
  })
})
