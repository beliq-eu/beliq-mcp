# Changelog

This file starts at 0.4.1. An earlier version has a heading here only for a
breaking change; the rest of its changes are in the git history between the
version tags (https://github.com/beliq-eu/beliq-mcp/tags). 0.1.0 is on npm
without a tag. Dates are the npm publish date, in UTC.

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
