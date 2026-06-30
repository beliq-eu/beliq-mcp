import { z } from 'zod'

// Validate accepts the live, publicly offered source-syntax hints only. The
// engine can technically detect more, but the public option set stays narrow
// (LPD-1): callers pass the syntax family, not a country profile.
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

const validateInputSchema = z.object(validateInputShape)
export type ValidateInput = z.infer<typeof validateInputSchema>
