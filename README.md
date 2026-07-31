# Dashboard

The admin web UI for the SessionLayer Control Plane: a client of the OpenAPI
contract that renders and drives the Control Plane's REST surface and talks to
nothing else.

It covers the full admin surface: nodes, rules, roles and bindings, CAs,
sessions, JIT approvals, locks, join tokens, service accounts, break-glass,
session-limit policies, audit search, and recording replay/export. Admins sign
in with OIDC (auth-code + PKCE); the bearer token lives in memory only.
Recording replay decrypts client-side with WebCrypto, so the customer key
never leaves the browser and the platform never sees it.

## Build and test

```bash
nvm use               # Node 22, see .nvmrc
npm ci
npm run build          # tsc -b + vite build
npm run test            # Vitest unit/component tests, API mocked with MSW
npm run test:e2e        # Playwright smoke, API mocked via route interception
./scripts/gate.sh       # the full quality gate
```

The typed API client is generated from the vendored OpenAPI spec
(`npm run generate:api`); CI fails if the checked-in client drifts from it.

## Documentation

Installation (serving headers, CSP origins, the https build-time guard) and
the recording-replay security model live in the
[Documentation repository](https://github.com/SessionLayer/Documentation).
Deployment references are under [`deploy/`](deploy/).

## License

GPL-3.0-only. See [LICENSE](./LICENSE).
