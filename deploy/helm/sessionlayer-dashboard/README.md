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
  --set 'csp.connectSrc={https://cp.example.com,https://idp.example.com,https://recordings.example.com}'
```

Replace the three origins with your Control Plane, identity provider and
recording object store, and `<the digest you verified>` with the digest
`cosign verify` reported for `ghcr.io/sessionlayer/dashboard`.

Point your ingress controller at the Service and terminate TLS there. The chart
ships no Ingress: the other three SessionLayer charts ship none either, and an
Ingress carries a TLS surface that belongs with your controller's conventions
rather than with this chart.

`ci/production-values.yaml` is a complete values file, kept as what the chart is
linted and schema-checked against.

## What is baked into the image, not set here

The Control Plane URL, the OIDC issuer and the OIDC client id are compiled into
the bundle at image build time, because Vite inlines `import.meta.env`. No
value in this chart moves them, and the image's build refuses a cleartext
`http://` endpoint for any credential-bearing URL.

That has one consequence for pinning: an image tag says which Dashboard release
it is, and nothing about which deployment it was built for. Set `image.digest`.

## Content-Security-Policy

`csp.connectSrc` becomes `SL_CSP_CONNECT_SRC`, which the image substitutes into
the `connect-src` directive at container start. Every origin the bundle fetches
from has to be there:

| Origin | What breaks without it |
|---|---|
| Control Plane | Every REST call. |
| OIDC issuer | The authorization-code and PKCE token exchange. |
| Recording object store | Replay and export, which download the still-encrypted object directly from the signed URL. |

Empty collapses `connect-src` to `'self'`. That is correct for a single-origin
deployment where one reverse proxy fronts the UI, the Control Plane and the
object store, and it is the fail-closed direction everywhere else: an omission
blocks calls instead of quietly widening the policy. The values schema accepts
`https://` origins only, so a cleartext origin cannot reach the header.

The rest of the header set, including `script-src 'self'` with no
`unsafe-inline`, HSTS, `frame-ancestors 'none'` and the deliberate absence of
`Cross-Origin-Embedder-Policy`, lives in the image. See `deploy/README.md`.

## Values

### Image

| Key | Default | Notes |
|---|---|---|
| `image.repository` | `ghcr.io/sessionlayer/dashboard` | |
| `image.tag` | `""` | Empty resolves to the chart's `appVersion`. |
| `image.digest` | `""` | Wins over `tag`. |
| `image.pullPolicy` | `IfNotPresent` | |
| `imagePullSecrets` | `[]` | The only secret reference this chart has. |

### Serving

| Key | Default | Notes |
|---|---|---|
| `replicaCount` | `2` | |
| `containerPort` | `8080` | The unprivileged nginx base listens here, so no privileged bind is ever needed. |
| `service.type` | `ClusterIP` | |
| `service.port` | `80` | |
| `csp.connectSrc` | `[]` | |
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

## What this chart is not

It is validated statically: `helm lint`, `helm template`, `values.schema.json`
and `kubeconform -strict` against the Kubernetes schemas. It has not been
installed into a live cluster as part of this repository's testing.

## See also

- `deploy/README.md` for the header set and the reverse-proxy reference config
- [Dashboard installation](https://github.com/SessionLayer/Documentation/blob/main/docs/installation/dashboard.md)
