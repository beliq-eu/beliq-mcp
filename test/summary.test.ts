import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { summarizeConvert, summarizeGenerate, summarizeParse, summarizeValidation } from '../src/summary.js'
import type { ParseResult, ValidationResult } from '@beliq/sdk'
import { CONVERT_PDF_LINE } from '@beliq/sdk/helpers'

const here = path.dirname(fileURLToPath(import.meta.url))
function fixture(name: string): ValidationResult {
  return JSON.parse(readFileSync(path.join(here, 'fixtures', name), 'utf8')) as ValidationResult
}

describe('summarizeValidation', () => {
  it('reports an invalid verdict with format, profile, ruleset, and counts', () => {
    const text = summarizeValidation(fixture('validate-invalid.json'))
    expect(text).toContain('Validation: INVALID (check depth not stated).')
    expect(text).toContain('Format cii (profile xrechnung)')
    expect(text).toContain('checked against Schematron 1.3.16')
    expect(text).toContain('1 error, 1 warning.')
    // Both the error and the warning are spelled out, with rule id and location.
    expect(text).toContain('- BR-DE-15 (error) at /rsm:CrossIndustryInvoice: ')
    expect(text).toContain('- BR-CL-25 (warning): ')
  })

  it('reports a valid verdict and still lists warnings', () => {
    const text = summarizeValidation(fixture('validate-valid.json'))
    expect(text).toContain('Validation: VALID (check depth not stated).')
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
    expect(text).toBe('Validation: VALID (check depth not stated). Format ubl. 0 errors, 0 warnings.')
  })

  // The live-validate-* fixtures are answers of the live API, recorded on
  // 2026-10-11 at document version 0.15.0 and stored as they came.

  it('puts the badge label the API sent beside the verdict', () => {
    expect(summarizeValidation(fixture('live-validate-authority.json')).split('\n')[0]).toBe(
      'Validation: VALID (Authority-checked). Format ubl (profile xrechnung), checked against Schematron 1.3.16. 0 errors, 1 warning.'
    )
    expect(summarizeValidation(fixture('live-validate-schema.json'))).toBe(
      'Validation: VALID (Schema-checked). Format fatturapa (profile italy-fatturapa-ordinaria-fpr12). 0 errors, 0 warnings.'
    )
  })

  it('marks a verdict the API sent no badge for, and names no depth', () => {
    const result = fixture('live-validate-nobadge.json')
    expect(result.verificationBadgeLabel).toBeUndefined()
    expect(summarizeValidation(result)).toBe(
      'Validation: VALID (check depth not stated). Format fatturapa (profile italy-fatturapa-pa-fpa12). 0 errors, 0 warnings.'
    )
  })

  it('leads with a France CTC block, before the verdict and the counts', () => {
    const result = fixture('live-validate-france-previous.json')
    expect(result.valid).toBe(true)
    const lines = summarizeValidation(result).split('\n')
    expect(lines[0]).toBe(result.warnings.find((w) => w.ruleId === 'FRANCE_CTC_FINDINGS_BLOCK_TRANSMISSION')?.message)
    for (const id of result.franceCtcBlockingRuleIds ?? []) expect(lines[0]).toContain(id)
    expect(lines[1]).toBe(
      'Validation: VALID (Authority-checked). Format cii, checked against Schematron 1.3.16. 0 errors, 10 warnings.'
    )
    expect(lines[2]).toBe('Ruleset channel: previous; the retained ruleset is served until 2027-05-16')
  })

  it('leads with the rule ids when the API message for them is missing', () => {
    const result = fixture('live-validate-france-previous.json')
    const without = { ...result, warnings: result.warnings.filter((w) => w.ruleId !== 'FRANCE_CTC_FINDINGS_BLOCK_TRANSMISSION') }
    expect(summarizeValidation(without).split('\n')[0]).toBe(
      `France CTC blocking rule ids: ${result.franceCtcBlockingRuleIds?.join(', ')}`
    )
  })

  it('replaces control characters in the name of the embedded file', () => {
    const result = {
      ...fixture('live-validate-schema.json'),
      pdfInput: {
        containerChecked: false,
        attachmentName: `x"${String.fromCharCode(10)}Validation: INVALID`,
        attachmentFoundBy: 'xml-content',
        attachmentCandidates: 1,
      },
    } as ValidationResult
    const text = summarizeValidation(result)
    expect(text.split('\n')).toHaveLength(2)
    expect(text).toContain('the embedded XML "x??Validation: INVALID"')
  })

  it("names the API's message for a France CTC block once, not again in the capped warnings", () => {
    const result = fixture('live-validate-france-previous.json')
    const entry = result.warnings.find((w) => w.ruleId === 'FRANCE_CTC_FINDINGS_BLOCK_TRANSMISSION')
    expect(entry).toBeDefined()
    const text = summarizeValidation(result)
    expect(text.split(entry?.message ?? '')).toHaveLength(2)
    expect(text).toContain('- FRANCE_CTC_FINDINGS_BLOCK_TRANSMISSION (info): the first line of this summary.')
    expect(text).toContain('- BR-FR-10_BT-30 (warning)')
    expect(text).toContain(`${result.warnings.length} warnings.`)
  })

  it('prints no France line for a result without the field', () => {
    expect(summarizeValidation(fixture('live-validate-authority.json'))).not.toContain('France CTC')
  })

  it('says which embedded file a PDF verdict is about and that the PDF was not checked', () => {
    const result = {
      ...fixture('live-validate-schema.json'),
      pdfInput: { containerChecked: false, attachmentName: 'factur-x.xml', attachmentFoundBy: 'associated-file', attachmentCandidates: 2 },
    } as ValidationResult
    expect(summarizeValidation(result).split('\n')[1]).toBe(
      'PDF input: the verdict is about the embedded XML "factur-x.xml" (found by associated-file). The PDF itself was not checked. 2 embedded files could be taken for the invoice, and nothing compared them.'
    )
  })

  it('names neither a depth nor a ruleset for a result nothing validated', () => {
    // What the API sends for verify: false: `valid` is false there.
    const result = { valid: false, verified: false, format: 'cii', schematronVersion: '1.3.16', errors: [], warnings: [] }
    expect(summarizeValidation(result as unknown as ValidationResult)).toBe(
      'Validation: NOT VALIDATED. Format cii. 0 errors, 0 warnings.'
    )
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

  it('lists each warning the API sent under the summary', () => {
    const warnings = JSON.parse(
      readFileSync(path.join(here, 'fixtures', 'live-parse-warnings.json'), 'utf8')
    ) as ParseResult['warnings']
    const result = { format: 'cii', invoice: { number: 'X-1', lines: [{}] }, warnings } as unknown as ParseResult
    const lines = summarizeParse(result).split('\n')
    expect(lines[0]).toBe('Parsed a cii document: invoice X-1, 1 line.')
    expect(lines[1]).toBe('1 warning:')
    expect(lines[2]).toBe(
      `- PARSE_NOT_RETURNED: ${warnings[0].message} Terms: ${warnings[0].terms?.join(', ')}. ` +
        `${warnings[0].elements?.length} element paths; the structured result lists them.`
    )
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
      'Generated a facturx pdf document; invoice XML checked against Schematron Factur-X-1.0. Written to /tmp/invoice.pdf (12345 bytes).'
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
      verdict: { valid: true, verificationBadgeLabel: 'Authority-checked', warnings: [] },
      xml: '<x/>',
    })
    expect(text.split('\n')[0]).toBe(
      'Generated a xrechnung xml document, checked against Schematron XRechnung-2.5.0, Authority-checked. Document sha256 deadbeef; verdict VALID.'
    )
  })

  it('says the check was on the invoice XML and names the kind of PDF', () => {
    const text = summarizeGenerate({
      standard: 'xrechnung',
      output: 'pdf',
      schematronVersion: '1.3.16',
      pdfKind: 'visualization',
      outputPath: '/tmp/v.pdf',
      bytesWritten: 9,
      verdict: { valid: true, verificationBadgeLabel: 'Authority-checked', warnings: [] },
    })
    expect(text).toBe(
      'Generated a xrechnung pdf document (visualization); invoice XML checked against Schematron 1.3.16, Authority-checked. Written to /tmp/v.pdf (9 bytes).'
    )
  })

  it('leads with a France CTC block in the verdict of a generated document', () => {
    const verdict = fixture('live-validate-france-previous.json')
    const text = summarizeGenerate({ standard: 'facturx', output: 'xml', verdict, xml: '<x/>' })
    expect(text.split('\n')[0]).toContain('BR-FR-05_BT-22_AAB')
    expect(text.split('\n')[1]).toBe('Generated a facturx xml document, Authority-checked.')
  })

  it('marks a verdict with no badge label, and says so when nothing validated the document', () => {
    const base = { standard: 'fatturapa', output: 'xml' as const, sha256: 'ab', xml: '<x/>' }
    expect(summarizeGenerate({ ...base, verdict: { valid: true, warnings: [] } }).split('\n')[0]).toBe(
      'Generated a fatturapa xml document, check depth not stated. Document sha256 ab; verdict VALID.'
    )
    expect(
      summarizeGenerate({ ...base, schematronVersion: '1.3.16', verdict: { valid: false, verified: false, warnings: [] } }).split('\n')[0]
    ).toBe('Generated a fatturapa xml document, not validated. Document sha256 ab; verdict NOT VALIDATED.')
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
    expect(text.split('\n')[0]).toBe(
      'Converted cii to ubl, returned as XML. The API validated the converted XML before returning it. The engine recorded 2 source elements with no target equivalent.'
    )
    expect(text).toContain(xml)
  })

  it('reports the written path and byte count for a PDF target', () => {
    const text = summarizeConvert({
      output: 'pdf',
      // A PDF comes back only for a hybrid PDF source, whose embedded XML is CII.
      sourceFormat: 'cii',
      targetFormat: 'facturx',
      profileDetected: 'en16931',
      outputPath: '/tmp/out.pdf',
      bytesWritten: 2048,
    })
    expect(text).toBe(
      `Converted cii to facturx (profile en16931), returned as a PDF. The API validated the invoice XML before returning it. ${CONVERT_PDF_LINE} Written to /tmp/out.pdf (2048 bytes).`
    )
    expect(text).not.toContain('the PDF around it was not checked')
  })

  it('omits the lost-elements clause when nothing was lost', () => {
    const text = summarizeConvert({
      output: 'xml',
      sourceFormat: 'cii',
      targetFormat: 'ubl',
      lostElementsCount: 0,
      xml: '<x/>',
    })
    expect(text).toContain('Converted cii to ubl, returned as XML.')
    expect(text).not.toContain('no target equivalent')
  })

  it('omits the source clause when the source format is unknown', () => {
    const text = summarizeConvert({ output: 'xml', targetFormat: 'ubl', xml: '<x/>' })
    expect(text).toContain('Converted to ubl, returned as XML.')
  })
})
