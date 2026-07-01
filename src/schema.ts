import { z } from 'zod'
import {
  LIVE_CONVERT_SOURCE_FORMATS,
  LIVE_CONVERT_TARGET_FORMATS,
  LIVE_GENERATE_STANDARDS,
  LIVE_PARSE_FORMATS,
  LIVE_PROFILES,
} from '@beliq/sdk'

// The tools expose the LIVE, authority-pinned public option sets (LPD-1),
// imported from the SDK so this stays one source of truth: callers pass a
// syntax family or a live standard, never a provisional/withheld profile. The
// engine can detect more; the public surface stays narrow.

export const validateInputShape = {
  document: z
    .string()
    .min(1)
    .optional()
    .describe('The invoice as XML text. Provide this OR documentPath, not both.'),
  documentPath: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Path to an invoice file on disk: a UBL/CII XML, or a PDF carrying embedded XML (Factur-X / ZUGFeRD). Provide this OR document.'
    ),
  format: z
    .enum(['auto', 'cii', 'ubl'])
    .optional()
    .describe("Source syntax hint. 'auto' (default) detects CII vs UBL from the document."),
  franceCtc: z
    .boolean()
    .optional()
    .describe('Apply the French CTC (Factur-X / Chorus Pro) rule overlay during validation.'),
}

const issueShape = z.object({
  ruleId: z.string(),
  severity: z.string(),
  location: z.string().optional(),
  message: z.string(),
})

export const validateOutputShape = {
  valid: z.boolean(),
  format: z.string(),
  profileDetected: z.string().optional(),
  schematronVersion: z.string().optional(),
  errorCount: z.number(),
  warningCount: z.number(),
  errors: z.array(issueShape),
  warnings: z.array(issueShape),
}

export const checkAccountOutputShape = {
  ok: z.boolean(),
  status: z.number(),
  plan: z.string().optional(),
  message: z.string(),
}

// ── Parse ────────────────────────────────────────────────────────────────

export const parseInputShape = {
  document: z
    .string()
    .min(1)
    .optional()
    .describe('The invoice as XML text. Provide this OR documentPath, not both.'),
  documentPath: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Path to an invoice file on disk: a UBL/CII XML, or a Factur-X / ZUGFeRD PDF. Provide this OR document.'
    ),
  format: z
    .enum(LIVE_PARSE_FORMATS)
    .optional()
    .describe("Source syntax hint. 'auto' (default) detects CII vs UBL from the document."),
}

// The extracted invoice is passed through verbatim from the API; the shape is
// documented on the endpoint, so the tool reports it without re-modelling it.
export const parseOutputShape = {
  format: z.string(),
  profileDetected: z.string().optional(),
  invoice: z.record(z.string(), z.unknown()),
}

// ── Generate ──────────────────────────────────────────────────────────────

const partyAddress = z
  .object({
    city: z.string(),
    postalCode: z.string(),
    countryCode: z.string().describe('ISO 3166-1 alpha-2, e.g. DE.'),
    street: z.string().optional(),
  })
  .passthrough()

const party = z
  .object({
    name: z.string(),
    vatId: z.string().optional(),
    address: partyAddress,
  })
  .passthrough()

const invoiceLine = z
  .object({
    description: z.string(),
    quantity: z.number(),
    unitCode: z.string().describe('UN/ECE Rec 20 unit code, e.g. HUR (hour), C62 (unit).'),
    unitPrice: z.number(),
    lineTotal: z.number(),
    vatRate: z.number(),
    vatCategoryCode: z.string().describe('UNCL5305 VAT category, e.g. S, Z, E.'),
  })
  .passthrough()

const invoice = z
  .object({
    number: z.string(),
    issueDate: z.string().describe('ISO date, YYYY-MM-DD.'),
    currencyCode: z.string().describe('ISO 4217, e.g. EUR.'),
    seller: party,
    buyer: party,
    lines: z.array(invoiceLine).min(1),
    totalNetAmount: z.number(),
    totalTaxAmount: z.number(),
    totalGrossAmount: z.number(),
  })
  .passthrough()
  .describe(
    'The EN 16931 invoice to render. Extra fields (dueDate, buyerReference, paymentMeans, taxSummary, per-country blocks) are passed through to the API.'
  )

export const generateInputShape = {
  standard: z.enum(LIVE_GENERATE_STANDARDS).describe('Target e-invoice standard to produce.'),
  invoice,
  output: z
    .enum(['xml', 'pdf'])
    .optional()
    .describe(
      "'xml' (default) returns the document inline. 'pdf' produces a Factur-X / ZUGFeRD hybrid PDF and needs outputPath to write it to."
    ),
  facturxProfile: z
    .enum(LIVE_PROFILES)
    .optional()
    .describe('Profile for a Factur-X / ZUGFeRD PDF; applies only when standard is facturx or zugferd.'),
  verify: z
    .boolean()
    .optional()
    .describe(
      'Validate the generated document before returning and fail if it is not compliant. Defaults to true.'
    ),
  outputPath: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Where to write the generated document on disk. Required for pdf output, optional for xml. The call fails if a file already exists at the path.'
    ),
}

export const generateOutputShape = {
  output: z.enum(['xml', 'pdf']),
  contentType: z.string(),
  schematronVersion: z.string().optional(),
  pdfKind: z.string().optional(),
  outputPath: z.string().optional(),
  bytesWritten: z.number().optional(),
  xml: z.string().optional(),
}

// ── Convert ────────────────────────────────────────────────────────────────

export const convertInputShape = {
  document: z
    .string()
    .min(1)
    .optional()
    .describe('The source invoice as XML text. Provide this OR documentPath, not both.'),
  documentPath: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Path to the source invoice on disk: a UBL/CII XML, or a Factur-X / ZUGFeRD PDF. Provide this OR document.'
    ),
  targetFormat: z
    .enum(LIVE_CONVERT_TARGET_FORMATS)
    .describe(
      'Format to convert to. cii, ubl, xrechnung, and peppol-bis come back as XML inline; facturx and zugferd produce a PDF and need outputPath.'
    ),
  sourceFormat: z
    .enum(LIVE_CONVERT_SOURCE_FORMATS)
    .optional()
    .describe("Source format hint. 'auto' (default) detects it from the document."),
  targetProfile: z
    .enum(LIVE_PROFILES)
    .optional()
    .describe('Profile for a facturx or zugferd target; ignored for the XML targets.'),
  dropFranceCtcOverlay: z
    .boolean()
    .optional()
    .describe('Drop the French CTC (Factur-X / Chorus Pro) overlay from the converted document.'),
  outputPath: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Where to write the converted document on disk. Required for a facturx/zugferd (PDF) target, optional for an XML target. The call fails if a file already exists at the path.'
    ),
}

export const convertOutputShape = {
  output: z.enum(['xml', 'pdf']),
  contentType: z.string(),
  sourceFormat: z.string().optional(),
  targetFormat: z.string().optional(),
  profileDetected: z.string().optional(),
  lostElementsCount: z.number().optional(),
  lostElements: z.array(z.string()).optional(),
  outputPath: z.string().optional(),
  bytesWritten: z.number().optional(),
  xml: z.string().optional(),
}

const validateInputSchema = z.object(validateInputShape)
export type ValidateInput = z.infer<typeof validateInputSchema>

const parseInputSchema = z.object(parseInputShape)
export type ParseInput = z.infer<typeof parseInputSchema>

const generateInputSchema = z.object(generateInputShape)
export type GenerateInput = z.infer<typeof generateInputSchema>

const convertInputSchema = z.object(convertInputShape)
export type ConvertInput = z.infer<typeof convertInputSchema>
