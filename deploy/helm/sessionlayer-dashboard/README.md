# sessionlayer-dashboard

Deploys the SessionLayer Dashboard as a Deployment, Service, ServiceAccount,
PodDisruptionBudget and NetworkPolicy. It serves the built Vite bundle from
nginx on port 8080 as uid 101, with a read-only root filesystem and one
writable path.

This repository ships no Kubernetes manifest, so unlike the charts for the
Control Plane, the Gateway and the Agent, this one is a new deployment
definition rather than a translation of an existing one. Its shape, labels,
security context and NetworkPolicy conventions follow those three.

## Install

```bash
helm install db deploy/helm/sessionlayer-dashboard \
  --namespace sessionlayer \
  --set image.digest=sha256:<the digest you verified> \
  --set endpoints.cpBaseUrl=https://cp.example.com \
  --set endpoints.oidcIssuer=https://idp.example.com \
  --set 'endpoints.objectStoreOrigins={https://recordings.example.com}'
```

The published image carries no endpoints of its own — it reads them at start —
so this is the whole of pointing it at a deployment, and `helm upgrade --set
endpoints.cpBaseUrl=...` repoints it without a rebuild. `<the digest you
verified>` is what `cosign verify` reported for the image.

`endpoints.cpBaseUrl` has no default, and rendering refuses without it:

```text
Error: execution error at (sessionlayer-dashboard/templates/deployment.yaml:2:4):
sessionlayer-dashboard: endpoints.cpBaseUrl is required. ...
```

For an evaluation on one machine, `--set endpoints.cpBaseUrl=http://localhost:8080`
and reach the Control Plane through a `kubectl port-forward`: loopback is the
one host where cleartext is accepted.

Point your ingress controller at the Service and terminate TLS there. The chart
ships no Ingress: the other three SessionLayer charts ship none either, and an
Ingress carries a TLS surface that belongs with your controller's conventions
rather than with this chart.

`ci/production-values.yaml` and `ci/evaluation-values.yaml` are those two
installs as complete values files, kept as what the chart is linted and
schema-checked against.

## Endpoints and the Content-Security-Policy

`endpoints.*` become `SL_*` environment on the container. Its entrypoint writes
them into `/config.js`, which the bundle reads before it starts, and derives the
`connect-src` directive from the same values in the same pass. There is
deliberately no way to set `connect-src` by hand: the two could then disagree,
and a runtime endpoint the policy blocks is a console that loads and reaches
nothing.

| Origin, and where it comes from | What breaks without it |
|---|---|
| Control Plane, from `endpoints.cpBaseUrl` | Every REST call. |
| OIDC issuer, from `endpoints.oidcIssuer` (or `oidcTokenEndpoint`) | The authorization-code and PKCE token exchange. |
| Recording object store, from `endpoints.objectStoreOrigins` | Replay and export, which download the still-encrypted object directly from the signed URL. |

A single-origin deployment, where one reverse proxy fronts the UI, the Control
Plane and the object store, needs no object store origin: `connect-src` then
carries `'self'` and the Control Plane alone. Every omission narrows the policy
rather than widening it.

`https://` is required for anything that is not loopback. The values schema
rejects a cleartext endpoint at `helm lint`, and the container applies the same
rule again at start and refuses to come up — so a value that reaches the pod by
another route, through `extraEnv` or an edited manifest, still cannot serve a
console that would put a bearer token on the wire in the clear.

An image tag says which Dashboard release it is. Since the same release serves
every deployment now, that is all a tag ever needs to say; set `image.digest`
to pin the bytes.

The rest of the header set, including `script-src 'self'` with no
`unsafe-inline`, HSTS, `frame-ancestors 'none'` and the deliberate absence of
`Cross-Origin-Embedder-Policy`, lives in the image. See `deploy/README.md`.

## Values

### Image

| Key | Default | Notes |
|---|---|---|
| `image.repository` | `ghcr.io/sessionlayer/dashboard` | The published image, which carries no endpoints of its own. |
| `image.tag` | `""` | Empty resolves to the chart's `appVersion`. |
| `image.digest` | `""` | Wins over `tag`. |
| `image.pullPolicy` | `IfNotPresent` | |
| `imagePullSecrets` | `[]` | The only secret reference this chart has. |

### Endpoints

| Key | Default | Notes |
|---|---|---|
| `endpoints.cpBaseUrl` | `""` | Required; rendering fails without it. |
| `endpoints.oidcIssuer` | `""` | Unset means the console offers no SSO sign-in. |
| `endpoints.oidcClientId` | `""` | The container defaults it to `sessionlayer-dashboard`. |
| `endpoints.oidcAuthorizeEndpoint` | `""` | Derived from the issuer when empty. |
| `endpoints.oidcTokenEndpoint` | `""` | Derived from the issuer when empty. |
| `endpoints.oidcRedirectUri` | `""` | The app defaults it to this console's own origin + `/auth/callback`. |
| `endpoints.oidcScope` | `""` | The container defaults it to `openid profile email`. |
| `endpoints.objectStoreOrigins` | `[]` | Space-joined into `SL_OBJECT_STORE_ORIGIN`. |

### Serving

| Key | Default | Notes |
|---|---|---|
| `replicaCount` | `2` | |
| `containerPort` | `8080` | The unprivileged nginx base listens here, so no privileged bind is ever needed. |
| `service.type` | `ClusterIP` | |
| `service.port` | `80` | |
| `resources.requests` | `10m` / `32Mi` | |
| `resources.limits` | `200m` / `128Mi` | Static files off local disk: the working set is the bundle, and a limit here cannot truncate a live session the way it would on the data path. |
| `terminationGracePeriodSeconds` | `30` | nginx finishes an in-flight static response in milliseconds. |
| `updateStrategy` | `maxSurge: 1`, `maxUnavailable: 0` | |
| `podDisruptionBudget.enabled` | `true` | |
| `podDisruptionBudget.minAvailable` | `1` | Rendering fails when this is not below `replicaCount`, because such a budget refuses every voluntary eviction and hangs a node drain. |

### Probes

All three request `/`, which serves `index.html`. A failure means nginx is
gone, not that a dependency is slow, so there is nothing to distinguish between
them.

| Key | Default |
|---|---|
| `probes.readiness.periodSeconds` | `5` |
| `probes.liveness.periodSeconds` | `15` |
| `probes.startup.periodSeconds` | `2`, 15 failures |

### Security context

| Key | Default |
|---|---|
| `podSecurityContext` | `runAsNonRoot: true`, uid/gid/fsGroup `101`, `seccompProfile: RuntimeDefault` |
| `containerSecurityContext` | `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, `capabilities.drop: [ALL]` |
| `serviceAccount.automountServiceAccountToken` | `false` |
| `tmpVolume` | `Memory`, `16Mi` |

nginx keeps its pid file, its client and proxy temp paths, and the config it
renders from the environment at start, all under `/tmp`. That is the only
writable path the image needs, which is what makes `readOnlyRootFilesystem`
hold.

### NetworkPolicy

| Key | Default | Notes |
|---|---|---|
| `networkPolicy.enabled` | `true` | |
| `networkPolicy.dnsPodSelector` | `k8s-app: kube-dns` | The only egress rule. |
| `networkPolicy.ingressFromNamespaceSelector` | `{}` | Empty accepts ingress on the container port from anywhere in the cluster, which is what an ingress controller in an arbitrary namespace needs. |
| `networkPolicy.ingressFromPodSelector` | `{}` | |

The browser fetches the API, the identity provider and the object store
directly, so nothing but name resolution leaves this pod.

### Scheduling and extension

`podAnnotations`, `podLabels`, `nodeSelector`, `tolerations`, `affinity`,
`topologySpreadConstraints`, `priorityClassName`, `extraEnv`, `extraEnvFrom`,
`extraVolumes` and `extraVolumeMounts` pass through unchanged.

## How far this chart is verified

Statically, on every push: `helm lint`, `helm template`, `values.schema.json`
and `kubeconform -strict` against the Kubernetes schemas.

By installation, once, on a 2 vCPU / 8 GB machine:

- A `kind` cluster (v0.30.0, Kubernetes v1.34.0, one node), with the image
  **built locally from `deploy/Dockerfile` and side-loaded** with
  `kind load docker-image`. **No image was pulled from a registry**, so nothing
  here says anything about the published artifact or about registry access.
- The chart installed and its pods reached **Ready** — the readiness probe
  answered, not merely that the objects rendered.
- `terminationGracePeriodSeconds`, the PodDisruptionBudget and the
  NetworkPolicy were checked on the live objects, and the cluster CNI
  (`kindnet`) enforces NetworkPolicy, so the policies were live rather than
  decorative.
- The cluster was destroyed afterwards. There is no standing environment and no
  CI job that repeats this: a later change to this chart is covered by the
  static checks above and by nothing else.

Also proven for this chart specifically: two replicas served the bundle, and
`helm upgrade --set endpoints.cpBaseUrl=...` repointed the running console —
same image, new `/config.js` and a new `connect-src`, no rebuild. A cleartext
endpoint was refused at `helm lint` by the values schema, and a cleartext
endpoint smuggled past the schema straight onto a pod stopped the container
with the reason in `kubectl logs`.

## See also

- `deploy/README.md` for the header set and the reverse-proxy reference config
- [Dashboard installation](https://github.com/SessionLayer/Documentation/blob/main/docs/installation/dashboard.md)
