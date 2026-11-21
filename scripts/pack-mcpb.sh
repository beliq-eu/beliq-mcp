#!/usr/bin/env bash
# Packs the MCPB bundle (manifest.json, the built server and its production
# dependencies) into the file given as $1. Run `npm run build` first.
set -euo pipefail

out="$(realpath -m "${1:?usage: scripts/pack-mcpb.sh <out.mcpb>}")"
root="$(cd "$(dirname "$0")/.." && pwd)"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

cd "$root"
test -f dist/index.js || { echo "dist/index.js is missing: run npm run build first" >&2; exit 1; }
cp manifest.json package.json package-lock.json LICENSE README.md "$stage/"
cp -R dist "$stage/dist"
(cd "$stage" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
npx --no-install mcpb validate "$stage/manifest.json"
npx --no-install mcpb pack "$stage" "$out"
