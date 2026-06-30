# beliq-mcp

An [MCP](https://modelcontextprotocol.io) server for [beliq](https://beliq.eu), the EU e-invoicing compliance API. It lets MCP clients (Claude Desktop, Claude Code, Cursor, and others) **validate** electronic invoices (XRechnung, ZUGFeRD, Factur-X, Peppol BIS, and other UBL/CII documents) against authority-pinned, drift-checked rules, and explain exactly what fails.

beliq validates the compliant document. Transmission (Peppol, PDP, KSeF, SDI), archiving, and tax-authority reporting stay with your access point.

## Tools

- **`beliq_validate_einvoice`** - validate a UBL/CII XML invoice (inline or by file path) or a Factur-X/ZUGFeRD PDF (by file path). Returns the verdict, the detected format and profile, the ruleset (Schematron) version it was checked against, and every error and warning with its rule id, severity, location, and message.
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
| `BELIQ_BASE_URL` | no | `https://api.beliq.eu` | Override for self-hosted or staging. |

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

## Reading a validation result

`beliq_validate_einvoice` returns a short text verdict plus a structured result:

- `valid` is true only when there are no errors; warnings do not make a document invalid.
- `format` and `profileDetected` report the detected syntax and business profile.
- `schematronVersion` is the exact ruleset revision the check ran against.
- `errors[]` and `warnings[]` each carry `ruleId`, `severity`, `location` (an XPath when available), and `message`.

A PDF (Factur-X / ZUGFeRD) must be passed by `documentPath`, not inlined as text.

## Agent skill

[`skill/SKILL.md`](./skill/SKILL.md) is a portable agent skill that teaches a model when to validate, how to read `errors`/`warnings`, and how to report a verdict, using the tools above. Drop it into a skills directory for an agent that should validate invoices on request.

## Development

This server depends on the published [`@beliq/sdk`](https://www.npmjs.com/package/@beliq/sdk), which carries the request, transport, and result-shaping logic. No lockfile is committed; `@beliq/sdk` is resolved fresh at install time.

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
