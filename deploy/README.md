# Dashboard deployment assets

Reference serving layers (`nginx.conf`, `Dockerfile`, `_headers`) that add the
security response headers a static bundle cannot set itself. See
`docs/installation/dashboard.md` in the
[Documentation](https://github.com/SessionLayer/Documentation) repo for the
header set, the `connect-src` origins, and the https guard these assets
implement.

## The image

The release workflow builds `ghcr.io/sessionlayer/dashboard:<tag>` from
`Dockerfile` on every `v*` tag, for `linux/amd64` and `linux/arm64`. Each push
carries an SPDX SBOM and SLSA provenance as in-toto attestations on the index,
and a keyless Sigstore signature over the index and both platform manifests. No
`:latest` tag is published — pin a tag, or a digest.

nginx runs as uid 101 with no root master process and writes only to `/tmp`, so
mount a tmpfs or an `emptyDir` there and the root filesystem can be read-only.
`nginx-container.conf` is the serving config; `security-headers.conf` and
`/config.js` are both rendered onto that tmpfs at start.

## Endpoints, at start

The image bakes in no endpoints. `runtime-config.sh` runs as
`/docker-entrypoint.d/05-sl-runtime-config.envsh`, reads the variables below,
writes `/config.js` for the bundle, and derives the CSP `connect-src` from the
same values in the same pass — so one published image serves any deployment,
and a runtime endpoint the policy would block cannot arise.

| Variable                     | Required | Notes                                                                                                                                                                    |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SL_CP_BASE_URL`             | yes      | Control Plane REST API.                                                                                                                                                  |
| `SL_OIDC_ISSUER`             |          | Authorize and token endpoints are derived from it.                                                                                                                       |
| `SL_OIDC_CLIENT_ID`          |          | Defaults to `sessionlayer-dashboard`.                                                                                                                                    |
| `SL_OIDC_AUTHORIZE_ENDPOINT` |          | For an issuer that does not use the conventional path.                                                                                                                   |
| `SL_OIDC_TOKEN_ENDPOINT`     |          | As above.                                                                                                                                                                |
| `SL_OIDC_REDIRECT_URI`       |          | Defaults to this console's own origin + `/auth/callback`.                                                                                                                |
| `SL_OIDC_SCOPE`              |          | Defaults to `openid profile email`.                                                                                                                                      |
| `SL_OBJECT_STORE_ORIGIN`     |          | Space-separated. The browser downloads the still-encrypted recording straight from the signed URL, so the store is the one origin to name that is not an endpoint above. |

```
docker run -p 8080:8080 --read-only --tmpfs /tmp \
  -e SL_CP_BASE_URL=https://cp.example.com \
  -e SL_OIDC_ISSUER=https://idp.example.com \
  -e SL_OBJECT_STORE_ORIGIN=https://recordings.example.com \
  ghcr.io/sessionlayer/dashboard:v0.0.2
```

Every endpoint must be `https://` unless its host is loopback, which is the
single-instance case where the browser reaches the Control Plane through a port
forward. **A value that breaks that rule, or a missing `SL_CP_BASE_URL`, stops
the container**: it prints the reason and exits non-zero rather than serve a
console pointed at the browser's own machine. `SL_CSP_CONNECT_SRC` is not an
input — it is derived — and a `VITE_` name is refused outright, because Vite
inlines those at build time and setting one on a container does nothing.

The same rule is enforced twice more, at the two other moments a bad endpoint
can arrive: `httpsGuard.ts` fails a build that bakes one in, and
`src/config/runtime.ts` renders a failure in place of the app rather than let a
bundle served by something other than this image reach a cleartext endpoint.
`runtimeConfig.test.ts` runs the build guard and the entrypoint over one table
of cases so they cannot drift apart.

## Building it yourself

```
docker build -f deploy/Dockerfile -t sessionlayer/dashboard:dev .
```

No `--build-arg` is needed or accepted for endpoints. A build that does bake
them — for a static host such as Netlify or Cloudflare Pages, which has no
entrypoint to run — sets the `VITE_` names and substitutes the `REPLACE-*`
origins in `_headers` itself.
