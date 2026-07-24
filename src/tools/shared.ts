import { readFile, writeFile } from 'node:fs/promises'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { BeliqApiError, type DocumentInput, type Invoice } from '@beliq/sdk'
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

/** Convert targets that produce a PDF rather than an inline XML document. */
const PDF_CONVERT_TARGETS = new Set(['facturx', 'zugferd'])

/**
 * Resolve a document-carrying input to the bytes/text the SDK reads. Exactly
 * one of document (inline XML) or documentPath (a file on disk) must be set; a
 * file is read as raw bytes so the SDK can sniff XML vs an embedded-XML PDF.
 */
async function resolveDocument(input: { document?: string; documentPath?: string }): Promise<DocumentInput> {
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

/**
 * Parse one document into a structured EN 16931 invoice and shape the MCP
 * result: a one-line summary in the text content plus the full invoice in
 * structuredContent. Input and API errors come back as isError so the model can
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
      structuredContent: {
        format: result.format,
        profileDetected: result.profileDetected,
        invoice: result.invoice,
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

/**
 * Generate a compliant document from an EN 16931 invoice. XML comes back inline
 * in the text content; a PDF (or an XML with outputPath set) is written to disk
 * and reported by path. verify defaults to true so the tool fails closed rather
 * than hand back a non-compliant document. Input and API errors come back as
 * isError so the model can self-correct.
 */
export async function runGenerate(input: GenerateInput, deps: ServerDeps): Promise<CallToolResult> {
  const output = input.output ?? 'xml'
  const outputPath = nonEmpty(input.outputPath) ? input.outputPath.trim() : undefined
  if (output === 'pdf' && !outputPath) {
    return errorResult('A pdf output needs outputPath: the file path to write the generated PDF to.')
  }

  let result
  try {
    result = await deps.client.generate({
      standard: input.standard,
      invoice: input.invoice as unknown as Invoice,
      output,
      facturxProfile: input.facturxProfile,
      verify: input.verify ?? true,
      // Always seal so the tool can hand back the document sha256 and the
      // validation verdict for the model to cite.
      seal: true,
    })
  } catch (err) {
    if (err instanceof BeliqApiError) {
      const code = err.code ? ` (${err.code})` : ''
      return errorResult(`beliq API error ${err.status}${code}: ${err.message}`)
    }
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
    valid: vr?.valid,
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
      validationResult: vr
        ? {
            valid: vr.valid,
            schematronVersion: vr.schematronVersion,
            errors: vr.errors ?? [],
            warnings: vr.warnings ?? [],
          }
        : undefined,
    },
  }
}

/**
 * Convert a document from one EN 16931 format to another. An XML target comes
 * back inline; a PDF target (facturx / zugferd) is written to disk and reported
 * by path. Any elements the conversion could not carry across are surfaced, so
 * a lossy conversion is visible. Input and API errors come back as isError so
 * the model can self-correct.
 */
export async function runConvert(input: ConvertInput, deps: ServerDeps): Promise<CallToolResult> {
  let document: DocumentInput
  try {
    document = await resolveDocument(input)
  } catch (err) {
    if (err instanceof BeliqInputError) return errorResult(err.message)
    return errorResult(`Could not read the document: ${(err as Error).message}`)
  }

  const output: 'xml' | 'pdf' = PDF_CONVERT_TARGETS.has(input.targetFormat) ? 'pdf' : 'xml'
  const outputPath = nonEmpty(input.outputPath) ? input.outputPath.trim() : undefined
  if (output === 'pdf' && !outputPath) {
    return errorResult(
      `Converting to ${input.targetFormat} produces a PDF and needs outputPath: the file path to write it to.`
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
    if (err instanceof BeliqApiError) {
      const code = err.code ? ` (${err.code})` : ''
      return errorResult(`beliq API error ${err.status}${code}: ${err.message}`)
    }
    throw err
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
