# Dashboard deployment assets

Reference serving layers (`nginx.conf`, `Dockerfile`, `_headers`) that add the
security response headers a static bundle cannot set itself. See
`docs/installation/dashboard.md` in the
[Documentation](https://github.com/SessionLayer/Documentation) repo for the
header set, the `connect-src` origins, and the build-time https guard these
assets implement.
