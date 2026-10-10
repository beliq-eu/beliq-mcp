import type { ParseResult, ValidationResult } from '@beliq/sdk'
import { checkDepth, franceBlockLines, pdfInputLine, rulesetChannelLine, verdictWord } from './verdict.js'

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
 * A compact human-readable verdict for the MCP text content. A France CTC
 * block leads, because the API reports it where `valid` is true and a reader
 * of the verdict line alone would miss it. Then the API's verdict word with
 * the check depth, the format, the profile and the ruleset version, what the
 * API says about the ruleset channel and a PDF input, and the errors and
 * warnings (capped). The full structured result rides alongside in
 * structuredContent.
 */
export function summarizeValidation(result: ValidationResult): string {
  const errors = (result.errors ?? []) as Issue[]
  const warnings = (result.warnings ?? []) as Issue[]

  const profile = result.profileDetected ? ` (profile ${result.profileDetected})` : ''
  // Nothing ran when `verified` is false, so there is no depth and no ruleset to name.
  const ran = result.verified !== false
  const depth = ran ? ` (${checkDepth(result)})` : ''
  const schematron =
    ran && result.schematronVersion ? `, checked against Schematron ${result.schematronVersion}` : ''

  const header =
    `Validation: ${verdictWord(result)}${depth}. Format ${result.format}${profile}${schematron}. ` +
    `${plural(errors.length, 'error')}, ${plural(warnings.length, 'warning')}.`

  return [
    ...franceBlockLines(result),
    header,
    rulesetChannelLine(result),
    pdfInputLine(result),
    ...listSection('Errors', errors),
    ...listSection('Warnings', warnings),
  ]
    .filter((line): line is string => line !== undefined)
    .join('\n')
}

/**
 * A human-readable summary of a parse: the detected syntax and profile, then
 * the invoice number, currency, line count, and gross total, then each warning
 * the API sent about what the document holds and the parsed invoice does not.
 * The full structured result rides alongside in structuredContent.
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
  const head = `Parsed a ${result.format}${profile} document: ${number}, ${plural(lines, 'line')}${gross}.`

  const warnings = result.warnings ?? []
  if (warnings.length === 0) return head
  const listed = warnings.map((w) => {
    const field = w.field ? ` (field ${w.field})` : ''
    const terms = w.terms?.length ? ` Terms: ${w.terms.join(', ')}.` : ''
    const elements = w.elements?.length
      ? ` ${plural(w.elements.length, 'element path')}; the structured result lists them.`
      : ''
    return `- ${w.code}${field}: ${w.message}${terms}${elements}`
  })
  return [head, `${plural(warnings.length, 'warning')}:`, ...listed].join('\n')
}

interface GenerateSummary {
  standard: string
  output: 'xml' | 'pdf'
  schematronVersion?: string
  outputPath?: string
  bytesWritten?: number
  xml?: string
  sha256?: string
  verdict?: Pick<ValidationResult, 'valid' | 'verified' | 'verificationBadgeLabel'>
}

/**
 * A human-readable summary of a generate, with the check depth of the
 * validation the API ran on the document, or that none ran. For an XML result
 * the document is appended in full so a client without structured output still
 * receives it; a PDF is reported by the path it was written to. The document
 * sha256 and the verdict are stated so the model can cite them.
 */
export function summarizeGenerate(g: GenerateSummary): string {
  const ran = g.verdict?.verified !== false
  const checked = ran && g.schematronVersion ? `, checked against Schematron ${g.schematronVersion}` : ''
  const depth = g.verdict === undefined ? '' : ran ? `, ${checkDepth(g.verdict)}` : ', not validated'
  const seal = g.sha256
    ? ` Document sha256 ${g.sha256}${g.verdict === undefined ? '' : `; verdict ${verdictWord(g.verdict)}`}.`
    : ''
  const header = `Generated a ${g.standard} ${g.output} document${checked}${depth}.${seal}`

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
 * profile, that the API validated the result, and how many source elements the
 * engine recorded as having no target equivalent. A convert carries no verdict,
 * so no check depth is named. For XML the document is appended in full; a PDF
 * is reported by the path it was written to.
 */
export function summarizeConvert(c: ConvertSummary): string {
  const fromClause = c.sourceFormat ? `${c.sourceFormat} ` : ''
  const target = c.targetFormat ?? 'the target format'
  const profile = c.profileDetected ? ` (profile ${c.profileDetected})` : ''
  const checked =
    c.output === 'pdf'
      ? ' The API validated the embedded XML before returning it; the PDF around it was not checked.'
      : ' The API validated the converted XML before returning it.'
  const lost =
    c.lostElementsCount && c.lostElementsCount > 0
      ? ` The engine recorded ${plural(c.lostElementsCount, 'source element')} with no target equivalent.`
      : ''
  const header = `Converted ${fromClause}to ${target}${profile}.${checked}${lost}`

  if (c.output === 'pdf') {
    const where = c.outputPath ? ` Written to ${c.outputPath} (${plural(c.bytesWritten ?? 0, 'byte')}).` : ''
    return `${header}${where}`
  }

  const wrote = c.outputPath ? ` Written to ${c.outputPath}.` : ''
  const body = c.xml ? `\n\n${c.xml}` : ''
  return `${header}${wrote}${body}`
}
