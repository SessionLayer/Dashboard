#!/usr/bin/env bash
# Dashboard quality gate. Self-contained: used by CI
# (.github/workflows/ci.yml) and locally. Playwright browsers must already be
# installed (CI runs `npx playwright install --with-deps chromium` first;
# locally run it once).
set -euo pipefail
cd "$(dirname "$0")/.."

npm run lint
npm run build
npm run test
npm run test:e2e
npm audit --audit-level=high

# Contract drift: the checked-in typed client MUST equal what the frozen spec
# regenerates. If this diffs, run `npm run generate:api` and commit the result.
npm run generate:api
git diff --exit-code -- src/api

echo "gate OK"
