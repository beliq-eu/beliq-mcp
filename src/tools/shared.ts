import { readFile } from 'node:fs/promises'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { BeliqApiError, type DocumentInput } from '@beliq/sdk'
import type { ServerDeps } from '../deps.js'
import type { ValidateInput } from '../schema.js'
import { summarizeValidation } from '../summary.js'

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** A bad tool input that should come back as a normal (non-fatal) tool error. */
class BeliqInputError extends Error {}

/**
 * Resolve the tool input to the bytes/text the SDK validates. Exactly one of
 * document (inline XML) or documentPath (a file on disk) must be set; a file is
 * read as raw bytes so the SDK can sniff XML vs an embedded-XML PDF.
 */
async function resolveDocument(input: ValidateInput): Promise<DocumentInput> {
  const hasDoc = nonEmpty(input.document)
  const hasPath = nonEmpty(input.documentPath)
  if (hasDoc === hasPath) {
    throw new BeliqInputError('Provide exactly one of document (XML text) or documentPath (a file path).')
  }
  if (hasDoc) return input.document as string
  return readFile((input.documentPath as string).trim())
}

/**
 * Validate one document and shape the MCP result: a human-readable verdict in
 * the text content plus the full structured result. Input and API errors come
 * back as isError so the model can self-correct; only unexpected faults throw.
 */
export async function runValidate(input: ValidateInput, deps: ServerDeps): Promise<CallToolResult> {
  let document: DocumentInput
  try {
    document = await resolveDocument(input)
  } catch (err) {
    if (err instanceof BeliqInputError) return errorResult(err.message)
    return errorResult(`Could not read the document: ${(err as Error).message}`)
  }

  try {
    const result = await deps.client.validate(document, {
      format: input.format,
      franceCtc: input.franceCtc,
    })
    const errors = result.errors ?? []
    const warnings = result.warnings ?? []
    return {
      content: [{ type: 'text', text: summarizeValidation(result) }],
      structuredContent: {
        valid: result.valid,
        format: result.format,
        profileDetected: result.profileDetected,
        schematronVersion: result.schematronVersion,
        errorCount: errors.length,
        warningCount: warnings.length,
        errors,
        warnings,
      },
    }
  } catch (err) {
    if (err instanceof BeliqApiError) {
      const code = err.code ? ` (${err.code})` : ''
      return errorResult(`beliq API error ${err.status}${code}: ${err.message}`)
    }
    throw err
  }
}

export interface CheckAccountResult {
  ok: boolean
  status: number
  plan?: string
  message: string
}

/**
 * Verify the configured key against GET /v1/me, which draws no quota. Reports
 * validity rather than throwing, so a rejected key is a normal (non-error)
 * result the model can act on.
 */
export async function runCheckAccount(deps: ServerDeps): Promise<CallToolResult> {
  const reply = (r: CheckAccountResult): CallToolResult => ({
    content: [{ type: 'text', text: r.message }],
    structuredContent: { ...r },
  })

  try {
    const account = await deps.client.me()
    const plan = account.plan?.name ?? undefined
    const quota = account.quota
    const quotaText = quota
      ? ` Quota: ${quota.used}/${quota.limit} used, ${quota.remaining} remaining.`
      : ''
    return reply({
      ok: true,
      status: 200,
      plan,
      message: `beliq credentials valid; the API key was accepted.${plan ? ` Plan: ${plan}.` : ''}${quotaText}`,
    })
  } catch (err) {
    if (err instanceof BeliqApiError) {
      const message =
        err.status === 401
          ? 'beliq API key rejected (401). Check the key set in BELIQ_API_KEY.'
          : `Credential check failed (${err.status}): ${err.message}`
      return reply({ ok: false, status: err.status, message })
    }
    throw err
  }
}
