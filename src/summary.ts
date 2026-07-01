import type { ParseResult, ValidationResult } from '@beliq/sdk'

/** How many issues to spell out before collapsing the rest into a count. */
const MAX_LISTED_ISSUES = 20

interface Issue {
  ruleId: string
  severity: string
  location?: string
  message: string
}

function issueLine(issue: Issue): string {
  const where = issue.location ? ` at ${issue.location}` : ''
  return `- ${issue.ruleId} (${issue.severity})${where}: ${issue.message}`
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function listSection(title: string, issues: Issue[]): string[] {
  if (!issues.length) return []
  const shown = issues.slice(0, MAX_LISTED_ISSUES)
  const lines = [`${title}:`, ...shown.map(issueLine)]
  if (issues.length > shown.length) {
    lines.push(`... and ${issues.length - shown.length} more.`)
  }
  return lines
}

/**
 * A compact human-readable verdict for the MCP text content: the pass/fail
 * line with format, profile, and ruleset version, then the errors and warnings
 * (capped). The full structured result rides alongside in structuredContent.
 */
export function summarizeValidation(result: ValidationResult): string {
  const errors = (result.errors ?? []) as Issue[]
  const warnings = (result.warnings ?? []) as Issue[]

  const verdict = result.valid ? 'VALID' : 'INVALID'
  const profile = result.profileDetected ? ` (profile ${result.profileDetected})` : ''
  const schematron = result.schematronVersion
    ? `, checked against Schematron ${result.schematronVersion}`
    : ''

  const header =
    `Validation: ${verdict}. Format ${result.format}${profile}${schematron}. ` +
    `${plural(errors.length, 'error')}, ${plural(warnings.length, 'warning')}.`

  return [header, ...listSection('Errors', errors), ...listSection('Warnings', warnings)].join('\n')
}

/**
 * A one-line human-readable summary of a parse: the detected syntax and
 * profile, then the invoice number, currency, line count, and gross total. The
 * full structured invoice rides alongside in structuredContent.
 */
export function summarizeParse(result: ParseResult): string {
  const invoice = result.invoice
  const profile = result.profileDetected ? ` (profile ${result.profileDetected})` : ''
  const number = invoice?.number ? `invoice ${invoice.number}` : 'invoice'
  const lines = invoice?.lines?.length ?? 0
  const gross =
    invoice?.totalGrossAmount != null
      ? `, gross ${invoice.totalGrossAmount} ${invoice.currencyCode ?? ''}`.trimEnd()
      : ''
  return `Parsed a ${result.format}${profile} document: ${number}, ${plural(lines, 'line')}${gross}.`
}

interface GenerateSummary {
  standard: string
  output: 'xml' | 'pdf'
  schematronVersion?: string
  outputPath?: string
  bytesWritten?: number
  xml?: string
}

/**
 * A human-readable summary of a generate. For an XML result the document is
 * appended in full so a client without structured output still receives it; a
 * PDF is reported by the path it was written to.
 */
export function summarizeGenerate(g: GenerateSummary): string {
  const checked = g.schematronVersion ? `, checked against Schematron ${g.schematronVersion}` : ''
  const header = `Generated a ${g.standard} ${g.output} document${checked}.`

  if (g.output === 'pdf') {
    const where = g.outputPath ? ` Written to ${g.outputPath} (${plural(g.bytesWritten ?? 0, 'byte')}).` : ''
    return `${header}${where}`
  }

  const wrote = g.outputPath ? ` Written to ${g.outputPath}.` : ''
  const body = g.xml ? `\n\n${g.xml}` : ''
  return `${header}${wrote}${body}`
}

interface ConvertSummary {
  output: 'xml' | 'pdf'
  sourceFormat?: string
  targetFormat?: string
  profileDetected?: string
  lostElementsCount?: number
  outputPath?: string
  bytesWritten?: number
  xml?: string
}

/**
 * A human-readable summary of a convert: the source and target formats, any
 * profile, and how many elements the conversion could not carry across (so a
 * lossy conversion is visible). For an XML target the document is appended in
 * full; a PDF target is reported by the path it was written to.
 */
export function summarizeConvert(c: ConvertSummary): string {
  const fromClause = c.sourceFormat ? `${c.sourceFormat} ` : ''
  const target = c.targetFormat ?? 'the target format'
  const profile = c.profileDetected ? ` (profile ${c.profileDetected})` : ''
  const lost =
    c.lostElementsCount && c.lostElementsCount > 0
      ? ` ${plural(c.lostElementsCount, 'element')} could not be carried across.`
      : ''
  const header = `Converted ${fromClause}to ${target}${profile}.${lost}`

  if (c.output === 'pdf') {
    const where = c.outputPath ? ` Written to ${c.outputPath} (${plural(c.bytesWritten ?? 0, 'byte')}).` : ''
    return `${header}${where}`
  }

  const wrote = c.outputPath ? ` Written to ${c.outputPath}.` : ''
  const body = c.xml ? `\n\n${c.xml}` : ''
  return `${header}${wrote}${body}`
}
