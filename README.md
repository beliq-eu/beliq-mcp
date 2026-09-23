# beliq-mcp

An [MCP](https://modelcontextprotocol.io) server for [beliq](https://beliq.eu), the EU e-invoicing compliance API. It lets MCP clients (Claude Desktop, Claude Code, Cursor, and others) **validate**, **parse**, **generate**, and **convert** electronic invoices (XRechnung, ZUGFeRD, Factur-X, Peppol BIS, and other UBL/CII documents) against authority-pinned, drift-checked rules, and explain exactly what fails.

beliq produces and checks the compliant document. Transmission (Peppol, PDP, KSeF, SDI), archiving, and tax-authority reporting stay with your access point.

## Tools

- **`beliq_validate_einvoice`** - validate a UBL/CII XML invoice (inline or by file path) or a Factur-X/ZUGFeRD PDF (by file path). Returns the verdict, the detected format and profile, the ruleset (Schematron) version it was checked against, and every error and warning with its rule id, severity, location, and message.
- **`beliq_parse_einvoice`** - parse a UBL/CII XML invoice or a Factur-X/ZUGFeRD PDF into a structured EN 16931 invoice (number, dates, currency, seller, buyer, lines, totals). Returns the detected format and profile and the extracted invoice.
- **`beliq_generate_einvoice`** - generate a compliant document (XRechnung, ZUGFeRD, Factur-X, or Peppol BIS) from an EN 16931 invoice object. XML comes back inline; a PDF is written to the `outputPath` you give. Validates the result before returning by default (`verify`), so a non-compliant document fails rather than coming back.
- **`beliq_convert_einvoice`** - convert a document from one EN 16931 format to another (`targetFormat` of cii, ubl, xrechnung, peppol-bis, facturx, or zugferd). An XML target comes back inline; a PDF target is written to `outputPath`. Reports any elements the conversion could not carry across.
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

- `valid` is true only when there are no errors; warnings do not make a document invalid.
- `format` and `profileDetected` report the detected syntax and business profile.
- `schematronVersion` is the exact ruleset revision the check ran against.
- `errors[]` and `warnings[]` each carry `ruleId`, `severity`, `location` (an XPath when available), and `message`.

`beliq_parse_einvoice` returns the detected `format` and `profileDetected` plus the extracted `invoice` object (EN 16931 fields: number, dates, currency, seller, buyer, lines, totals, and any national extensions present).

`beliq_generate_einvoice` returns a short text summary (with the XML document appended for XML output) plus a structured result:

- `output` is `xml` or `pdf`, as requested, and `contentType` is the matching media type (`application/xml` or `application/pdf`).
- `xml` is the generated document inline, present only for XML output.
- `outputPath` and `bytesWritten` are set when the document was written to disk: always for a PDF, and for XML when you set `outputPath`. The call never overwrites an existing file, so pick a path that does not exist.
- `pdfKind` is present only for PDF output: `hybrid` (a PDF/A-3 with the XML embedded, for facturx and zugferd) or `visualization` (rendered pages with no XML inside, for xrechnung and peppol-bis, whose legal document stays the XML).
- `schematronVersion` is the ruleset (Schematron) revision the document was checked against.
- `sha256` is the lowercase-hex SHA-256 of the returned document bytes, so `sha256sum` on the file at `outputPath` reproduces it.
- `rulesetSha256` is one combined fingerprint of the rule artifacts the document was checked against, present when a ruleset ran.
- `livemode` is true for a `blq_live_` key and false for a `blq_test_` sandbox key, whose output is [marked as a specimen](https://docs.beliq.eu/api-reference/test-mode/#sandbox-markers) and is not a production invoice.
- `validationResult` is the verdict on the generated document: `valid`, the `schematronVersion` it ran, and `errors[]`/`warnings[]` in the same shape as validate returns. With the default `verify: true`, a document that fails validation comes back as a tool error instead of a result. With `verify: false` no ruleset runs: `valid` is false and `errors`/`warnings` are empty because nothing checked the document, not because it failed.

`beliq_convert_einvoice` returns a short text summary (with the XML document appended for an XML target) plus a structured result:

- `output` is `pdf` for a facturx or zugferd target and `xml` for the others, and `contentType` is the matching media type (`application/pdf` or `application/xml`).
- `xml` is the converted document inline, present only for an XML target.
- `outputPath` and `bytesWritten` are set when the document was written to disk: always for a PDF target, and for an XML target when you set `outputPath`. Like generate, it never overwrites an existing file.
- `sourceFormat` is the format the engine read, and `targetFormat` the format it produced (the `targetFormat` you asked for when the API does not name one).
- `profileDetected` is the profile the engine recognised on the source document, when it recognised one.
- `lostElementsCount` and `lostElements` count and name the source elements that had no equivalent in the target format; `0` means nothing was lost at the element level.

A PDF (Factur-X / ZUGFeRD) must be passed by `documentPath` for validate, parse, and convert, not inlined as text.

## Agent skill

[`skill/SKILL.md`](./skill/SKILL.md) is a portable agent skill that teaches a model when to validate, how to read `errors`/`warnings`, and how to report a verdict, using the tools above. Drop it into a skills directory for an agent that should validate invoices on request.

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
