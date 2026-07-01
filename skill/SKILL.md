---
name: beliq-validate-einvoice
description: This skill should be used when the user wants to check whether an EU electronic invoice is compliant: validating an XRechnung, ZUGFeRD, Factur-X, Peppol BIS, or other UBL/CII invoice against authority-pinned rules, and explaining what fails and why. Triggers on phrases like "validate this invoice", "is this XRechnung valid", "check this e-invoice for compliance", "why is my ZUGFeRD rejected", "what EN 16931 rules does this break", or any request to verify an invoice XML or a Factur-X/ZUGFeRD PDF against the rules. Requires the beliq MCP server and a beliq API key.
version: 0.1.0
---

# beliq: validate EU e-invoices

Use the beliq MCP server to validate an EU electronic invoice and explain the result. beliq checks a document against authority-pinned, drift-checked rule sets (the official Schematron and XSD bundles for each format) and returns a precise verdict: whether it is valid, the format and profile it detected, the ruleset version it was checked against, and every rule that failed.

## When this applies

The user has an e-invoice (or a path to one) and wants to know if it is compliant, or wants the failures explained. The document can be:

- UBL or CII **XML** (XRechnung, Peppol BIS, and other EN 16931 syntaxes).
- A **Factur-X / ZUGFeRD PDF** (a PDF with embedded invoice XML); pass it by file path.

This skill focuses on validation. To parse a document into a structured invoice, generate a compliant one, or convert between formats, the same beliq MCP server exposes `beliq_parse_einvoice`, `beliq_generate_einvoice`, and `beliq_convert_einvoice`.

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
  - `format` (optional) - `auto` (default, detects CII vs UBL), `cii`, or `ubl`.
  - `franceCtc` (optional) - set true to apply the French CTC (Factur-X / Chorus Pro) rule overlay.
- **`beliq_check_account`** - verifies the configured key and reports the plan and remaining quota. It draws no quota. Run it first if a call fails with an auth error, to confirm the key is accepted.

## How to validate

1. If the user pasted XML, pass it as `document`. If they pointed at a file (especially a PDF), pass `documentPath` - do not try to read a binary PDF into `document`.
2. Leave `format` as `auto` unless the user is explicit about the syntax.
3. Set `franceCtc: true` only when the invoice targets the French CTC flow.

## Interpreting the result

The tool returns a structured result plus a one-line verdict:

- `valid` - true only when there are no errors. Warnings do not make a document invalid.
- `format` - the detected syntax (`cii`, `ubl`, ...).
- `profileDetected` - the business profile, for example `xrechnung` or `peppol-bis`.
- `schematronVersion` - the exact ruleset version the check ran against. Cite it when explaining a verdict, so the user knows which authority revision applied.
- `errors[]` and `warnings[]` - each issue has:
  - `ruleId` - the business rule, for example `BR-DE-15` or `PEPPOL-EN16931-R053`.
  - `severity` - `fatal`, `error`, `warning`, or `info`.
  - `location` - where in the document the rule fired (an XPath), when available.
  - `message` - the human-readable explanation.

When reporting back:

- Lead with the verdict ("valid" or "not valid") and the format/profile.
- For a failure, list the errors with their `ruleId` and `message`, and use `location` to point the user at the offending element. Group or summarize if there are many.
- Mention notable warnings, but make clear they do not block validity.
- If the user wants to fix the invoice, explain what each failing rule requires; do not invent rule semantics beyond the returned `message`.

## Scope and wording

beliq validates and produces the *compliant document*. Transmission (Peppol, PDP, KSeF, SDI), archiving, and tax-authority reporting stay with the user's access point or service provider. Do not describe beliq as sending, filing, submitting, or transmitting an invoice.

Only describe the formats and countries beliq actually supports as live. Do not promise coverage for a format that the tool does not return a result for; if validation reports the format as `unknown`, say the document could not be recognized rather than guessing.
