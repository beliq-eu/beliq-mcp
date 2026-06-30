import type { ValidationResult } from '@beliq/sdk'

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
