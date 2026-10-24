import { z } from 'zod'
import {
  LIVE_CONVERT_SOURCE_FORMATS,
  LIVE_CONVERT_TARGET_FORMATS,
  LIVE_GENERATE_STANDARDS,
  LIVE_PARSE_FORMATS,
  LIVE_PROFILES,
  LIVE_VALIDATE_FORMATS,
  type ConvertResult,
  type GenerateResult,
  type ParseResult,
  type ValidationResult,
} from '@beliq/sdk'

// The tools expose the SDK's LIVE_* option sets, imported rather than retyped
// so this stays one source of truth. Each carries every value the API accepts
// for its operation: generate offers all eight standards, the four national
// XSD ones included, while convert offers fewer because the API's own convert
// enums do. GET /v1/rulesets carries the badge saying how deep each format's
// check goes.

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
      'Path to an invoice file on disk: an XML document, or a PDF carrying embedded XML (Factur-X / ZUGFeRD). Provide this OR document.'
    ),
  format: z
    .enum(LIVE_VALIDATE_FORMATS)
    .optional()
    .describe("Source syntax hint. 'auto' (default) detects the format from the document."),
  franceCtc: z
    .boolean()
    .optional()
    .describe('Also apply the French CTC rules (BR-FR-CTC) during validation.'),
}

const issueShape = z.object({
  ruleId: z.string(),
  severity: z.string(),
  location: z.string().optional(),
  message: z.string(),
})

const text = (): z.ZodOptional<z.ZodString> => z.string().optional()

/**
 * Every field of the SDK's ValidationResult, passed on as the API sent it. The
 * `satisfies` holds this list to the SDK's type, so a field the API gains
 * fails the typecheck at the SDK bump instead of being dropped without notice.
 */
const validationResultShape = {
  valid: z
    .boolean()
    .describe(
      'Whether the document passed the rule packs and schemas beliq runs for its format, in the versions this result names. Not a statement that every recipient or tax authority accepts it.'
    ),
  verified: z
    .boolean()
    .optional()
    .describe('False only when no ruleset ran (generate with verify: false). Then valid says nothing about the document.'),
  format: z.string(),
  profileDetected: text(),
  verificationTier: text(),
  verificationBadge: text().describe('Id of the check depth. Compare this, not the label.'),
  verificationBadgeLabel: text().describe(
    'The check depth as English display text. Print it as it is. Absent when the API states no depth for this verdict: then say the check depth was not stated, and name none.'
  ),
  schematronVersion: text(),
  ciusVersion: text(),
  peppolVersion: text(),
  facturxProfile: text(),
  facturxVersion: text(),
  franceCtcApplied: z.boolean().optional(),
  franceCtcVersion: text(),
  franceExtendedCtcApplied: z.boolean().optional(),
  franceCtcBlockingRuleIds: z
    .array(z.string())
    .optional()
    .describe(
      'French CTC rule ids the API reports as ending a transmission through a French platform. Present also where valid is true, and never empty: when present, lead with it.'
    ),
  italyFatturapaXsdBundle: text(),
  italyFatturapaRuntimeVersion: text(),
  italySdiMessaggiXsdBundle: text(),
  italySdiMessaggiXsdVersion: text(),
  spainFacturaeXsdBundle: text(),
  spainFacturaeRuntimeVersion: text(),
  sloveniaEslogXsdBundle: text(),
  sloveniaEslogRuntimeVersion: text(),
  polandKsefFa3XsdBundle: text(),
  polandKsefFa3RuntimeVersion: text(),
  romaniaRoCiusVersion: text(),
  netherlandsNlciusVersion: text(),
  rulesetChannel: text(),
  rulesetFellBack: z.boolean().optional(),
  rulesetSunsetsOn: text(),
  pdfInput: z
    .object({
      containerChecked: z.boolean(),
      attachmentName: z.string().optional(),
      attachmentFoundBy: z.string(),
      attachmentCandidates: z.number(),
    })
    .optional()
    .describe(
      'Present when the document was a PDF: which embedded file the verdict is about. containerChecked is always false, because the PDF itself is not checked.'
    ),
  sha256: text(),
  rulesetSha256: text(),
  rulesetArtifacts: z
    .array(z.object({ key: z.string(), version: z.string(), fileSha256: z.string() }))
    .optional(),
  driftCheckedAt: text(),
  errors: z.array(issueShape),
  warnings: z.array(issueShape),
} satisfies Record<keyof ValidationResult, z.ZodTypeAny>

export const validateOutputShape = {
  ...validationResultShape,
  errorCount: z.number(),
  warningCount: z.number(),
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
// The other fields are held to the SDK's type like the validation result.
export const parseOutputShape = {
  format: z.string(),
  profileDetected: text(),
  profileUrn: text(),
  businessProcessId: text(),
  franceCtcDetected: z.boolean().optional(),
  invoice: z.record(z.string(), z.unknown()),
  warnings: z
    .array(
      z.object({
        code: z.string(),
        message: z.string(),
        field: z.string().optional(),
        terms: z.array(z.string()).optional(),
        elements: z.array(z.object({ path: z.string(), count: z.number() })).optional(),
      })
    )
    .describe(
      'What the document holds and the parsed invoice does not. Report these with the invoice: an empty list is the only case in which the invoice is all the API read.'
    ),
} satisfies Record<keyof ParseResult, z.ZodTypeAny>

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
      "'xml' (default) returns the document inline. 'pdf' needs outputPath to write it to: for facturx and zugferd it is a hybrid PDF/A-3 with the XML embedded; xrechnung and peppol-bis have no hybrid form, so it is a visualization with no XML inside it, and their legal document stays the XML."
    ),
  facturxProfile: z
    .enum(LIVE_PROFILES)
    .optional()
    .describe(
      'Profile for a Factur-X / ZUGFeRD document; ignored for xrechnung and peppol-bis. extended-ctc-fr is Factur-X only: zugferd accepts basicwl, en16931 and extended.'
    ),
  verify: z
    .boolean()
    .optional()
    .describe(
      'Validate the generated document before returning it, and fail if it does not pass. Defaults to true.'
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
  outputEnvelope: z.string().optional(),
  outputPath: z.string().optional(),
  bytesWritten: z.number().optional(),
  xml: z.string().optional(),
  // The verify-it-yourself seal: sha256 of the returned document, the combined
  // ruleset fingerprint it was checked against, and the validation verdict.
  sha256: z.string().optional(),
  rulesetSha256: z.string().optional(),
  livemode: z.boolean().optional(),
  validationResult: z.object(validationResultShape).optional(),
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
      'Format to convert to. An XML source comes back as XML inline for every target, facturx and zugferd included. A hybrid PDF source sent to facturx or zugferd comes back as a PDF and needs outputPath.'
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
    .describe('Drop the French CTC overlay from the converted document.'),
  outputPath: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Where to write the converted document on disk. Required when a PDF source goes to a facturx or zugferd target, optional otherwise. The call fails if a file already exists at the path.'
    ),
}

export const convertOutputShape = {
  output: z.enum(['xml', 'pdf']).describe('What came back, read from the response: xml, or pdf for a returned hybrid PDF.'),
  contentType: z.string(),
  sourceFormat: z.string().optional(),
  targetFormat: z.string().optional(),
  profileDetected: z.string().optional(),
  lostElementsCount: z.number().optional(),
  lostElements: z.array(z.string()).optional(),
  conversionTools: z.string().optional(),
  livemode: z.boolean().optional(),
  outputPath: z.string().optional(),
  bytesWritten: z.number().optional(),
  xml: z.string().optional(),
}

/**
 * Where each field of the SDK's generate and convert results goes in the
 * output shapes above, which are flat and typed by hand. A field is either
 * passed on under the named key or left out with its reason. The `satisfies`
 * makes a field the SDK gains fail the typecheck until it has an entry.
 */
type Placed<Shape> = keyof Shape | { omitted: string }

export const GENERATE_RESULT_FIELDS = {
  contentType: 'contentType',
  bytes: { omitted: 'the document itself: inline as xml, or written to outputPath' },
  xml: 'xml',
  sha256: 'sha256',
  validationResult: 'validationResult',
  meta: { omitted: 'flattened, see GENERATE_META_FIELDS' },
} satisfies Record<keyof GenerateResult, Placed<typeof generateOutputShape>>

export const GENERATE_META_FIELDS = {
  schematronVersion: 'schematronVersion',
  pdfKind: 'pdfKind',
  outputEnvelope: 'outputEnvelope',
  rulesetSha256: 'rulesetSha256',
  rulesetArtifacts: { omitted: 'validationResult.rulesetArtifacts carries the same list' },
  livemode: 'livemode',
} satisfies Record<keyof GenerateResult['meta'], Placed<typeof generateOutputShape>>

export const CONVERT_RESULT_FIELDS = {
  contentType: 'contentType',
  bytes: { omitted: 'the document itself: inline as xml, or written to outputPath' },
  meta: { omitted: 'flattened, see CONVERT_META_FIELDS' },
} satisfies Record<keyof ConvertResult, Placed<typeof convertOutputShape>>

export const CONVERT_META_FIELDS = {
  sourceFormat: 'sourceFormat',
  targetFormat: 'targetFormat',
  profileDetected: 'profileDetected',
  lostElementsCount: 'lostElementsCount',
  lostElements: 'lostElements',
  conversionTools: 'conversionTools',
  livemode: 'livemode',
} satisfies Record<keyof ConvertResult['meta'], Placed<typeof convertOutputShape>>

export type ValidateInput = z.infer<z.ZodObject<typeof validateInputShape>>

export type ParseInput = z.infer<z.ZodObject<typeof parseInputShape>>

export type GenerateInput = z.infer<z.ZodObject<typeof generateInputShape>>

export type ConvertInput = z.infer<z.ZodObject<typeof convertInputShape>>
