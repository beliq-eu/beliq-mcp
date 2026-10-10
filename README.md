# beliq-mcp

An [MCP](https://modelcontextprotocol.io) server for [beliq](https://beliq.eu), the EU e-invoicing compliance API. It lets MCP clients (Claude Desktop, Claude Code, Cursor, and others) **validate**, **parse**, **generate**, and **convert** electronic invoices (XRechnung, ZUGFeRD, Factur-X, Peppol BIS, and the other formats the API carries), and explain exactly what fails. Every verdict states how deep its check went.

beliq produces and checks the document. Transmission (Peppol, PDP, KSeF, SDI), archiving, and tax-authority reporting stay with your access point.

## Tools

- **`beliq_validate_einvoice`** - validate an invoice XML (inline or by file path) or a Factur-X/ZUGFeRD PDF (by file path). Returns the verdict, how deep the check went, the detected format and profile, the ruleset versions it was checked against, and every error and warning with its rule id, severity, location, and message. For a PDF the verdict is about the embedded XML; the PDF itself is not checked.
- **`beliq_parse_einvoice`** - parse a UBL/CII XML invoice or a Factur-X/ZUGFeRD PDF into a structured EN 16931 invoice (number, dates, currency, seller, buyer, lines, totals). Returns the detected format and profile, the extracted invoice, and warnings that say what the document holds and the parsed invoice does not.
- **`beliq_generate_einvoice`** - generate a document from an EN 16931 invoice object. XML comes back inline; a PDF is written to the `outputPath` you give. By default (`verify`) the API validates the document before returning it, and a document that fails comes back as a tool error with the failed rules. The tool description tells the model to ask for missing invoice data instead of making it up.
- **`beliq_convert_einvoice`** - convert a document from one EN 16931 format to another. The result is XML, inline, for every target, `facturx` and `zugferd` included; a PDF comes back only when a hybrid PDF source already is the target, and is written to `outputPath`. Reports how many source elements the engine recorded as having no target equivalent.
- **`beliq_check_account`** - verify the configured API key and report the plan and remaining quota. Calls `GET /v1/me`, which draws no quota; useful as a connection and credential smoke test.

## Installation

Requires Node.js >= 20.15. Published to npm, so clients can run it with `npx`:

```
npx -y beliq-mcp
```

The server is configured entirely through environment variables (see below).

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `BELIQ_API_KEY` | yes | - | API key from the beliq dashboard (API Keys). |
| `BELIQ_AUTH` | no | `header` | How the key is sent: `header` (X-API-Key) or `bearer` (Authorization: Bearer). |
| `BELIQ_BASE_URL` | no | `https://api.beliq.eu` | Override for a self-hosted deployment; defaults to the production API. |

## Client setup

### Claude Code

```
claude mcp add beliq -e BELIQ_API_KEY=your-key -- npx -y beliq-mcp
```

### Claude Desktop

Add to `claude_desktop_config.json` (Settings > Developer > Edit Config):

```json
{
  "mcpServers": {
    "beliq": {
      "command": "npx",
      "args": ["-y", "beliq-mcp"],
      "env": {
        "BELIQ_API_KEY": "your-key"
      }
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json` (or a project `.cursor/mcp.json`) using the same `mcpServers` block shown for Claude Desktop.

## Reading a result

`beliq_validate_einvoice` returns a short text verdict plus a structured result:

- `valid` is the API's verdict: the document passed the rule packs and schemas beliq runs for its format, in the versions this result names. It does not mean every recipient, validation tool or tax authority accepts it. Warnings do not make a document invalid, with one case to read beside it: `franceCtcBlockingRuleIds`.
- `verificationBadgeLabel` is the check depth as English display text, and the text verdict prints it beside `VALID` or `INVALID`. [How verification works](https://docs.beliq.eu/compliance/how-verification-works/) explains each depth. Where the API sends no label, the text says `check depth not stated` and names no depth. `verificationBadge` and `verificationTier` are the ids behind the label.
- `franceCtcBlockingRuleIds` lists the French CTC rule ids the API reports as ending a transmission through a French platform. It can be present where `valid` is true, and the text verdict then leads with it. The result stays a normal result, not a tool error. `franceCtcApplied`, `franceCtcVersion` and `franceExtendedCtcApplied` say which French packs ran.
- `pdfInput` is present when the document was a PDF: `attachmentName`, `attachmentFoundBy` and `attachmentCandidates` say which embedded file the verdict is about, and `containerChecked` is always false because the PDF itself is not checked.
- `format` and `profileDetected` report the detected syntax and business profile.
- `schematronVersion` is the ruleset revision the check ran against. The versions of the other packs and schema bundles that ran come in `ciusVersion`, `peppolVersion`, `facturxProfile`, `facturxVersion`, `italyFatturapaXsdBundle`, `italyFatturapaRuntimeVersion`, `italySdiMessaggiXsdBundle`, `italySdiMessaggiXsdVersion`, `spainFacturaeXsdBundle`, `spainFacturaeRuntimeVersion`, `sloveniaEslogXsdBundle`, `sloveniaEslogRuntimeVersion`, `polandKsefFa3XsdBundle`, `polandKsefFa3RuntimeVersion`, `romaniaRoCiusVersion` and `netherlandsNlciusVersion`, each present only when it applies.
- `rulesetChannel` is present when a ruleset channel was selected, which an organisation whose default channel is `previous` does with no input of this tool. `rulesetFellBack` and `rulesetSunsetsOn` come with it when they apply.
- `sha256` is the hash of the document that was checked, `rulesetSha256` and `rulesetArtifacts` fingerprint the rule files that ran, and `driftCheckedAt` is when those files were last confirmed to match their upstream sources.
- `verified` is false only when no ruleset ran, which validate never returns; see generate below.
- `errors` and `warnings` each carry `ruleId`, `severity`, `location` (an XPath when available), and `message`. `errorCount` and `warningCount` are their lengths.

The structured result carries every field of the API's validation result. Its shape is checked against the SDK's type, so a field the API adds cannot go missing here without failing the build.

`beliq_parse_einvoice` returns a text summary plus a structured result:

- `format`, `profileDetected` and `profileUrn` report the detected syntax and profile; `businessProcessId` and `franceCtcDetected` are present when the document states them.
- `invoice` is the extracted invoice object (EN 16931 fields: number, dates, currency, seller, buyer, lines, totals). A field the API holds no value for is left out.
- `warnings` says what the document holds and the parsed invoice does not: each entry has a `code`, a `message`, and, by code, a `field`, the `terms` (EN 16931 business groups) or the `elements` (paths with counts) concerned. The text summary lists them.

`beliq_generate_einvoice` returns a short text summary (with the XML document appended for XML output) plus a structured result:

- `output` is `xml` or `pdf`, as requested, and `contentType` is the matching media type (`application/xml` or `application/pdf`).
- `xml` is the generated document inline, present only for XML output.
- `outputPath` and `bytesWritten` are set when the document was written to disk: always for a PDF, and for XML when you set `outputPath`. The call never overwrites an existing file, so pick a path that does not exist.
- `pdfKind` is present only for PDF output: `hybrid` (a PDF/A-3 with the XML embedded, for facturx and zugferd) or `visualization` (rendered pages with no XML inside, for xrechnung and peppol-bis, whose legal document stays the XML).
- `schematronVersion` is the ruleset (Schematron) revision the document was checked against.
- `outputEnvelope` is the envelope the document is wrapped in, when the API names one.
- `sha256` is the lowercase-hex SHA-256 of the returned document bytes, so `sha256sum` on the file at `outputPath` reproduces it.
- `rulesetSha256` is one combined fingerprint of the rule artifacts the document was checked against, present when a ruleset ran.
- `livemode` is true for a `blq_live_` key and false for a `blq_test_` sandbox key, whose output is [marked as a specimen](https://docs.beliq.eu/api-reference/test-mode/#sandbox-markers) and is not a production invoice.
- `validationResult` is the API's verdict on the generated document, with every field validate returns, the check depth in `verificationBadgeLabel` included; the text summary names that depth. The verdict is about the invoice XML, so for a PDF the text says so and names the kind of PDF. With the default `verify: true`, a document that fails validation comes back as a tool error that lists the failed rules. With `verify: false` no ruleset runs: `verified` is false, `errors` and `warnings` are empty because nothing checked the document, and the text says `not validated`.

`beliq_convert_einvoice` returns a short text summary (with the XML document appended for an XML target) plus a structured result:

- `output` is what came back, read from the response: `xml` for every target when the source is XML, `facturx` and `zugferd` included, and `pdf` only when a hybrid PDF source already is the `facturx` or `zugferd` target. `contentType` is the matching media type.
- `xml` is the converted document inline, present only when XML came back.
- `outputPath` and `bytesWritten` are set when the document was written to disk: always for a PDF, and for XML when you set `outputPath`. Like generate, it never overwrites an existing file.
- `sourceFormat` is the format the engine read, and `targetFormat` the format it produced (the `targetFormat` you asked for when the API does not name one).
- `profileDetected` is the profile the engine recognised on the source document, when it recognised one.
- `conversionTools` names the toolchain that did the conversion, when the API names one.
- `livemode` is true for a `blq_live_` key and false for a `blq_test_` sandbox key.
- `lostElementsCount` and `lostElements` count and name the source elements the engine recorded as having no target equivalent. A loss the engine does not detect is not counted, so `0` does not say that every field of the source arrived.

A successful convert means the API validated the converted XML before returning it. It carries no verdict and no check depth. A converted document that fails comes back as a tool error that lists the failed rules.

A PDF (Factur-X / ZUGFeRD) must be passed by `documentPath` for validate, parse, and convert, not inlined as text.

## Agent skill

[`skill/SKILL.md`](./skill/SKILL.md) is a portable agent skill that teaches a model when to validate, how to read `errors`/`warnings`, and how to report a verdict with its check depth, using the tools above. Drop it into a skills directory for an agent that should validate invoices on request.

## Development

This server depends on the published [`@beliq/sdk`](https://www.npmjs.com/package/@beliq/sdk), which carries the request, transport, and result-shaping logic. `package-lock.json` is committed, and CI and the release build install from it with `npm ci`.

- `npm install`
- `npm run build` - compile to `dist/`
- `npm run typecheck`
- `npm run lint`
- `npm test` - unit tests (result summary) and an in-memory MCP round-trip with a fake SDK client
- `BELIQ_API_KEY=your-key npm run test:integration` - live smoke tests against the real API
- `npm run scrub:check` - check for em-dashes in source and docs

Run the built server directly for a quick check:

```
BELIQ_API_KEY=your-key node dist/index.js
```

## License

[MIT](./LICENSE)
