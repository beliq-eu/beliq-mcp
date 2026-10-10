import { readFile, writeFile } from 'node:fs/promises'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import {
  BeliqApiError,
  isProfileAllowedForStandard,
  profilesForStandard,
  type DocumentInput,
  type Invoice,
  type ValidationResult,
} from '@beliq/sdk'
import type { ServerDeps } from '../deps.js'
import type { ConvertInput, GenerateInput, ParseInput, ValidateInput } from '../schema.js'
import { summarizeConvert, summarizeGenerate, summarizeParse, summarizeValidation } from '../summary.js'

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** A bad tool input that should come back as a normal (non-fatal) tool error. */
class BeliqInputError extends Error {}

/** The convert targets for which the API can hand a hybrid PDF source back as a PDF. */
const HYBRID_CONVERT_TARGETS = new Set(['facturx', 'zugferd'])

function isPdf(document: string | Uint8Array): boolean {
  if (typeof document === 'string') return document.startsWith('%PDF-')
  return new TextDecoder('latin1').decode(document.subarray(0, 5)) === '%PDF-'
}

/**
 * An API error as a tool error. A 422 from generate or convert carries the
 * validation result of the document the API refused, so the failed rules are
 * appended for the model to act on.
 */
function apiErrorResult(err: BeliqApiError): CallToolResult {
  const code = err.code ? ` (${err.code})` : ''
  const refused = err.details?.validationResult as ValidationResult | undefined
  const rules = refused && typeof refused === 'object' ? `\n${summarizeValidation(refused)}` : ''
  return errorResult(`beliq API error ${err.status}${code}: ${err.message}${rules}`)
}

/**
 * Resolve a document-carrying input to the bytes/text the SDK reads. Exactly
 * one of document (inline XML) or documentPath (a file on disk) must be set; a
 * file is read as raw bytes so the SDK can sniff XML vs an embedded-XML PDF.
 */
async function resolveDocument(input: { document?: string; documentPath?: string }): Promise<string | Uint8Array> {
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
 * the text content plus every field of the API result. A document that is not
 * valid, or that carries France CTC blocking rule ids, is a normal result:
 * isError is for input and API errors, so the model can self-correct. Only
 * unexpected faults throw.
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
      structuredContent: { ...result, errorCount: errors.length, warningCount: warnings.length, errors, warnings },
    }
  } catch (err) {
    if (err instanceof BeliqApiError) return apiErrorResult(err)
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

/**
 * Parse one document into a structured EN 16931 invoice and shape the MCP
 * result: a summary with the API's warnings in the text content plus the full
 * result in structuredContent. Input and API errors come back as isError so the model can
 * self-correct; only unexpected faults throw.
 */
export async function runParse(input: ParseInput, deps: ServerDeps): Promise<CallToolResult> {
  let document: DocumentInput
  try {
    document = await resolveDocument(input)
  } catch (err) {
    if (err instanceof BeliqInputError) return errorResult(err.message)
    return errorResult(`Could not read the document: ${(err as Error).message}`)
  }

  try {
    const result = await deps.client.parse(document, { format: input.format })
    return {
      content: [{ type: 'text', text: summarizeParse(result) }],
      structuredContent: { ...result, warnings: result.warnings ?? [] },
    }
  } catch (err) {
    if (err instanceof BeliqApiError) return apiErrorResult(err)
    throw err
  }
}

/**
 * Generate a document from an EN 16931 invoice. XML comes back inline in the
 * text content; a PDF (or an XML with outputPath set) is written to disk and
 * reported by path. verify defaults to true, so the API refuses a document
 * that fails its own validation instead of handing it back. Input and API
 * errors come back as isError so the model can self-correct.
 */
export async function runGenerate(input: GenerateInput, deps: ServerDeps): Promise<CallToolResult> {
  const output = input.output ?? 'xml'
  const outputPath = nonEmpty(input.outputPath) ? input.outputPath.trim() : undefined
  if (output === 'pdf' && !outputPath) {
    return errorResult('A pdf output needs outputPath: the file path to write the generated PDF to.')
  }
  // The SDK drops facturxProfile outside the Factur-X / ZUGFeRD family. Inside
  // it the pair is still pinned: extended-ctc-fr is Factur-X only, and the API
  // answers it on zugferd with 422 PROFILE_STANDARD_MISMATCH. Name the legal
  // values rather than spend a call on a pair that cannot succeed.
  const hybrid = input.standard === 'facturx' || input.standard === 'zugferd'
  if (hybrid && input.facturxProfile && !isProfileAllowedForStandard(input.standard, input.facturxProfile)) {
    return errorResult(
      `facturxProfile '${input.facturxProfile}' is not available for ${input.standard}. ` +
        `Use one of: ${profilesForStandard(input.standard).join(', ')}.`
    )
  }

  let result
  try {
    result = await deps.client.generate({
      standard: input.standard,
      invoice: input.invoice as unknown as Invoice,
      output,
      facturxProfile: input.facturxProfile,
      // XRechnung and Peppol BIS have no hybrid PDF, and the API refuses PDF
      // for them unless the request names a visual to render. Factur-X and
      // ZUGFeRD render theirs either way, so this is inert for them.
      template: output === 'pdf' ? 'standard' : undefined,
      verify: input.verify ?? true,
      // Always seal so the tool can hand back the document sha256 and the
      // validation verdict for the model to cite.
      seal: true,
    })
  } catch (err) {
    if (err instanceof BeliqApiError) return apiErrorResult(err)
    throw err
  }

  let bytesWritten: number | undefined
  if (outputPath) {
    try {
      await writeFile(outputPath, result.bytes, { flag: 'wx' })
      bytesWritten = result.bytes.byteLength
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        return errorResult(`A file already exists at ${outputPath}. Choose a path that does not exist.`)
      }
      return errorResult(`Could not write the document: ${(err as Error).message}`)
    }
  }

  const vr = result.validationResult
  const text = summarizeGenerate({
    standard: input.standard,
    output,
    schematronVersion: result.meta.schematronVersion,
    outputPath,
    bytesWritten,
    xml: output === 'xml' ? result.xml : undefined,
    sha256: result.sha256,
    verdict: vr,
  })

  return {
    content: [{ type: 'text', text }],
    structuredContent: {
      output,
      contentType: result.contentType,
      schematronVersion: result.meta.schematronVersion,
      pdfKind: result.meta.pdfKind,
      outputPath,
      bytesWritten,
      xml: output === 'xml' ? result.xml : undefined,
      sha256: result.sha256,
      rulesetSha256: result.meta.rulesetSha256,
      livemode: result.meta.livemode,
      validationResult: vr ? { ...vr, errors: vr.errors ?? [], warnings: vr.warnings ?? [] } : undefined,
    },
  }
}

/**
 * Convert a document from one EN 16931 format to another. The API returns XML
 * for every target, facturx and zugferd included, and it comes back inline. A
 * PDF comes back only when a hybrid PDF source already is the target; it is
 * written to disk and reported by path. The count of lost elements is what the
 * engine recorded, and a loss it does not detect is not in it. Input and API
 * errors come back as isError so the model can self-correct.
 */
export async function runConvert(input: ConvertInput, deps: ServerDeps): Promise<CallToolResult> {
  let document: string | Uint8Array
  try {
    document = await resolveDocument(input)
  } catch (err) {
    if (err instanceof BeliqInputError) return errorResult(err.message)
    return errorResult(`Could not read the document: ${(err as Error).message}`)
  }

  const outputPath = nonEmpty(input.outputPath) ? input.outputPath.trim() : undefined
  if (isPdf(document) && HYBRID_CONVERT_TARGETS.has(input.targetFormat) && !outputPath) {
    return errorResult(
      `A PDF source converted to ${input.targetFormat} can come back as a PDF and needs outputPath: the file path to write it to.`
    )
  }

  let result
  try {
    result = await deps.client.convert(document, {
      targetFormat: input.targetFormat,
      sourceFormat: input.sourceFormat,
      targetProfile: input.targetProfile,
      dropFranceCtcOverlay: input.dropFranceCtcOverlay,
    })
  } catch (err) {
    if (err instanceof BeliqApiError) return apiErrorResult(err)
    throw err
  }

  const output: 'xml' | 'pdf' = result.contentType.includes('pdf') ? 'pdf' : 'xml'
  if (output === 'pdf' && !outputPath) {
    return errorResult('The API returned a PDF, which needs outputPath: the file path to write it to.')
  }
  const xml = output === 'xml' ? new TextDecoder().decode(result.bytes) : undefined
  const targetFormat = result.meta.targetFormat ?? input.targetFormat

  let bytesWritten: number | undefined
  if (outputPath) {
    try {
      await writeFile(outputPath, result.bytes, { flag: 'wx' })
      bytesWritten = result.bytes.byteLength
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        return errorResult(`A file already exists at ${outputPath}. Choose a path that does not exist.`)
      }
      return errorResult(`Could not write the document: ${(err as Error).message}`)
    }
  }

  const text = summarizeConvert({
    output,
    sourceFormat: result.meta.sourceFormat,
    targetFormat,
    profileDetected: result.meta.profileDetected,
    lostElementsCount: result.meta.lostElementsCount,
    outputPath,
    bytesWritten,
    xml,
  })

  return {
    content: [{ type: 'text', text }],
    structuredContent: {
      output,
      contentType: result.contentType,
      sourceFormat: result.meta.sourceFormat,
      targetFormat,
      profileDetected: result.meta.profileDetected,
      lostElementsCount: result.meta.lostElementsCount,
      lostElements: result.meta.lostElements,
      outputPath,
      bytesWritten,
      xml,
    },
  }
}
