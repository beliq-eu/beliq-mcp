---
name: beliq-validate-einvoice
description: This skill should be used when the user wants to check whether an EU electronic invoice is valid: validating an XRechnung, ZUGFeRD, Factur-X, Peppol BIS, or other e-invoice against the rules beliq runs for its format, saying how deep that check went, and explaining what fails and why. Triggers on phrases like "validate this invoice", "is this XRechnung valid", "check this e-invoice", "why is my ZUGFeRD rejected", "what EN 16931 rules does this break", or any request to verify an invoice XML or a Factur-X/ZUGFeRD PDF against the rules. Requires the beliq MCP server and a beliq API key.
version: 0.1.0
---

# beliq: validate EU e-invoices

Use the beliq MCP server to validate an EU electronic invoice and explain the result. beliq checks a document against the rule packs and schemas it runs for that format and returns a verdict: whether it is valid, how deep the check went, the format and profile it detected, the ruleset versions it was checked against, and every rule that failed. The depth differs by format, from the authority's own rules down to structure only, and the result says which.

## When this applies

The user has an e-invoice (or a path to one) and wants to know if it is valid, or wants the failures explained. The document can be:

- Invoice **XML** (XRechnung, Peppol BIS, and the other formats beliq carries).
- A **Factur-X / ZUGFeRD PDF** (a PDF with embedded invoice XML); pass it by file path. The verdict is then about the embedded XML: the PDF itself is not checked.

This skill focuses on validation. To parse a document into a structured invoice, generate one, or convert between formats, the same beliq MCP server exposes `beliq_parse_einvoice`, `beliq_generate_einvoice`, and `beliq_convert_einvoice`.

## Prerequisite: the MCP server

The tools come from the `beliq-mcp` server. If it is not already configured, install it once:

```
claude mcp add beliq -e BELIQ_API_KEY=blq_your_key -- npx -y beliq-mcp
```

Create the API key in the beliq dashboard under API Keys. To send the key as a bearer token instead of `X-API-Key`, add `-e BELIQ_AUTH=bearer`.

## Tools

- **`beliq_validate_einvoice`** - the primary tool. Inputs:
  - `document` - the invoice as XML text, OR
  - `documentPath` - a path to an XML or Factur-X/ZUGFeRD PDF file on disk (provide exactly one of these two).
  - `format` (optional) - `auto` (default, detects the format), `cii`, or `ubl`.
  - `franceCtc` (optional) - set true to also apply the French CTC rules (BR-FR-CTC).
- **`beliq_check_account`** - verifies the configured key and reports the plan and remaining quota. It draws no quota. Run it first if a call fails with an auth error, to confirm the key is accepted.

## How to validate

1. If the user pasted XML, pass it as `document`. If they pointed at a file (especially a PDF), pass `documentPath` - do not try to read a binary PDF into `document`.
2. Leave `format` as `auto` unless the user is explicit about the syntax.
3. Set `franceCtc: true` only when the invoice targets the French CTC flow.

## Interpreting the result

The tool returns a structured result plus a one-line verdict:

- `valid` - the API's verdict: the document passed the rule packs and schemas beliq runs for its format, in the versions the result names. It does not mean every recipient, validation tool or tax authority accepts it.
- `verificationBadgeLabel` - how deep the check went, as display text. Absent when the API states no depth for this verdict.
- `franceCtcBlockingRuleIds` - French CTC rule ids the API reports as ending a transmission through a French platform. Can be present where `valid` is true.
- `pdfInput` - present when the document was a PDF: which embedded file the verdict is about. The PDF itself is never checked.
- `format` - the detected syntax (`cii`, `ubl`, ...).
- `profileDetected` - the business profile, for example `xrechnung` or `peppol-bis`.
- `schematronVersion` - the exact ruleset version the check ran against. Cite it when explaining a verdict, so the user knows which authority revision applied.
- `errors[]` and `warnings[]` - each issue has:
  - `ruleId` - the business rule, for example `BR-DE-15` or `PEPPOL-EN16931-R053`.
  - `severity` - `fatal`, `error`, `warning`, or `info`.
  - `location` - where in the document the rule fired (an XPath), when available.
  - `message` - the human-readable explanation.

When reporting back:

- If `franceCtcBlockingRuleIds` is present, lead with it, also where `valid` is true: say that the API reports these rule ids as ending a transmission through a French platform, and name them.
- Give the verdict ("valid" or "not valid") with the check depth beside it, in the words of `verificationBadgeLabel`, and the format/profile. If the label is absent, say that the check depth was not stated. Do not name a depth yourself, and do not call a document "compliant": no field of the result says that.
- For a PDF, say that the verdict is about the embedded XML and that the PDF itself was not checked.
- For a failure, list the errors with their `ruleId` and `message`, and use `location` to point the user at the offending element. Group or summarize if there are many.
- Mention notable warnings, and make clear they do not change `valid`. The French CTC ids above are the case where a document with `valid: true` is still reported as blocked.
- If the user wants to fix the invoice, explain what each failing rule requires; do not invent rule semantics beyond the returned `message`.

## Scope and wording

beliq validates and produces the document. Transmission (Peppol, PDP, KSeF, SDI), archiving, and tax-authority reporting stay with the user's access point or service provider. Do not describe beliq as sending, filing, submitting, or transmitting an invoice.

Only describe the formats and countries beliq actually supports as live. Do not promise coverage for a format that the tool does not return a result for; if validation reports the format as `unknown`, say the document could not be recognized rather than guessing.
