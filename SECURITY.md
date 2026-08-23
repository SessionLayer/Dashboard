# Security policy

Report a vulnerability through GitHub's private vulnerability reporting: the
**Security** tab above, then **Report a vulnerability**. That opens a thread
only you and the maintainers can read. Do not open a public issue, pull
request, or discussion for a security finding.

[SessionLayer's vulnerability disclosure policy](https://github.com/SessionLayer/Documentation/blob/main/docs/security/vulnerability-disclosure.md)
is the single authority for every repository in this organization: what to
include in a report, full scope, embargo and credit, and how to verify that
the release you installed is the build the advisory named. Read it before
reporting.

## Scope in this repository

The SessionLayer Dashboard is the admin web UI and a browser client of the
Control Plane REST API. It decrypts session recordings client-side, so the
customer recording key never leaves the browser.

In scope: bearer-token handling, the client-side recording decryption, XSS and
CSP escapes, the security headers in the reference serving layer under
`deploy/`, anything that puts plaintext or a token somewhere the browser
retains it, and `release.yml`.

The policy lists the out-of-scope set, including test fixtures and committed
test keys, volumetric denial-of-service testing, anything starting from a
credential the threat model already assumes lost, and accepted risks already
documented in the trust model.

## Response targets

The [disclosure policy](https://github.com/SessionLayer/Documentation/blob/main/docs/security/vulnerability-disclosure.md)
carries the one timeline this organization keeps, from acknowledgement through
triage, fix and embargo, and it covers every repository including this one.
Advisories credit you unless you ask to stay anonymous, and request a CVE for
findings rated moderate or above. There is no bug bounty.
