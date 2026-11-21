# Changelog

This file starts at 0.4.1. An earlier version has a heading here only for a
breaking change; the rest of its changes are in the git history between the
version tags (https://github.com/beliq-eu/beliq-mcp/tags). 0.1.0 is on npm
without a tag. Dates are the npm publish date, in UTC.

## 0.5.1 - 2026-11-21

- The npm and MCP Registry descriptions say that delivery through beliq is in
  development, and that the server validates, parses, generates and converts
  e-invoices. No tool in this server sends an invoice.
- Each release attaches `beliq-mcp-<version>.mcpb`, an MCPB bundle that
  installs the server in Claude Desktop and other MCPB clients. It asks for
  the API key and for how the key is sent.

## 0.5.0 - 2026-11-16

- Breaking: `beliq_convert_einvoice` returns each `lostElements` entry as an
  object with `path`, `value`, `reason`, `severity` and `acceptableLoss`.
  Before, each entry was the string `[object Object]`. When the list would
  pass the API's 6 KB header cap, it holds one `{ "truncated": true }` entry
  with a `reason` instead, and `lostElementsCount` stays the exact count.
- An outage is retried for up to 10 seconds, and each attempt gets up to 45
  seconds, so a tool call ends within 55 seconds, inside the 60-second
  request limit of the MCP TypeScript SDK's client. Before, it was retried 3
  times. When beliq asks for a longer wait, or the API cannot be reached, the
  tool error says beliq is unavailable for now and, when beliq sent a
  `Retry-After`, in how many seconds to try the same call again. Any other
  API error with a `Retry-After`, such as a 429 rate limit, names that wait
  too.
- `beliq_check_account` reports an API it cannot reach as a failed check.
  Before, the call failed with a protocol error.
- When the MCP client cancels a tool call, the call to beliq ends at once,
  also during a wait between retries.
- The `beliq_validate_einvoice` result has `rulesetSupersededOn`: the date
  the authority made the successor of a selected ruleset mandatory. A
  `RULESET_SUPERSEDED` warning names each such ruleset.
- `beliq_validate_einvoice`'s `format` also accepts `fatturapa`, `facturae`,
  `eslog` and `poland_ksef_fa3`.
- `beliq_generate_einvoice` and `beliq_convert_einvoice` refuse an
  `outputPath` that already exists, or whose directory is missing or not
  writable, before they call the API, so such a path no longer uses up a
  document.
- `beliq_check_account` and `beliq_validate_einvoice` return `livemode`.
  The text of `beliq_check_account` says whether the quota is the plan quota
  or a test key's sandbox allowance, and the generate and convert summaries
  say when a test key made the document.
- The tool descriptions say that delivery through beliq is in development,
  and that beliq does not operate KSeF submission.
- package.json declares `mcpName` `io.github.beliq-eu/beliq-mcp`, and the
  release workflow lists each version under that name in the official MCP
  Registry (https://registry.modelcontextprotocol.io).

## 0.4.1 - 2026-10-24

- The description and the text summary of `beliq_convert_einvoice` say which
  PDF comes back when a hybrid PDF is converted to `facturx` or `zugferd`, and
  that a PDF made with a test key is watermarked after any veraPDF check.
- When a validation result carries a France CTC block, the warnings in the
  text summary no longer repeat the API's block message. That entry points at
  the summary's first line, and the warning count is unchanged.
- The tool descriptions say plateforme agréée where they said PDP.

## 0.4.0 - 2026-10-12

- Breaking: `beliq_convert_einvoice` returns an XML source converted to
  `facturx` or `zugferd` as XML inline, with `output` set to `xml`, and needs
  `outputPath` only for a PDF source. Before, it reported `output: pdf` and
  required `outputPath`.
