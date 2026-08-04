# Dashboard deployment assets

Reference serving layers (`nginx.conf`, `Dockerfile`, `_headers`) that add the
security response headers a static bundle cannot set itself. See
`docs/installation/dashboard.md` in the
[Documentation](https://github.com/SessionLayer/Documentation) repo for the
header set, the `connect-src` origins, and the build-time https guard these
assets implement.

## The image

The release workflow builds `ghcr.io/sessionlayer/dashboard:<tag>` from
`Dockerfile` on every `v*` tag, for `linux/amd64` and `linux/arm64`. Each push
carries an SPDX SBOM and SLSA provenance as in-toto attestations on the index,
and a keyless Sigstore signature over the index and both platform manifests. No
`:latest` tag is published — pin a tag, or a digest.

nginx runs as uid 101 with no root master process and writes only to `/tmp`, so
mount a tmpfs or an `emptyDir` there and the root filesystem can be read-only.
`nginx-container.conf` is the serving config and the `security-headers.conf`
template is rendered onto that tmpfs at start.

Two variables shape a deployment, and both fail closed when unset:

- `SL_CSP_CONNECT_SRC` — space-separated Control Plane, OIDC and object-store
  origins the SPA may call. Unset, `connect-src` collapses to `'self'` and every
  cross-origin call is blocked until you set it.
- `VITE_CP_BASE_URL`, `VITE_OIDC_ISSUER`, `VITE_OIDC_CLIENT_ID` — build args,
  not runtime environment: Vite inlines them into the bundle. The published
  image is built without them and falls back to the `http://localhost:8080`
  development default, so rebuild it with your own endpoints:

```
docker build -f deploy/Dockerfile \
  --build-arg VITE_CP_BASE_URL=https://cp.example.com \
  --build-arg VITE_OIDC_ISSUER=https://idp.example.com \
  --build-arg VITE_OIDC_CLIENT_ID=sessionlayer-dashboard \
  -t sessionlayer/dashboard:dev .
```
