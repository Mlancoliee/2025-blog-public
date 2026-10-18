#!/usr/bin/env bash
set -Eeuo pipefail
cd /workspace
case "${1:-dependencies}" in
  dependencies) npx --yes pnpm@11.7.0 install --frozen-lockfile ;;
  check)
    npx --yes pnpm@11.7.0 exec vitest run tests/stack
    npx --yes pnpm@11.7.0 exec tsc --noEmit --incremental false
    ;;
  build) npx --yes pnpm@11.7.0 run build ;;
  preview) npx --yes pnpm@11.7.0 exec next dev --turbopack -p 2026 -H 0.0.0.0 ;;
  browser)
    npm install --prefix /tmp/inkstack-playwright --no-package-lock --ignore-scripts playwright@1.51.1
    NODE_PATH=/tmp/inkstack-playwright/node_modules node tests/stack/browser.mjs
    ;;
  *) exit 2 ;;
esac
