# syntax=docker/dockerfile:1
# SessionLayer Dashboard — production image: build the static bundle, then serve
# dist/ behind nginx with the strict security headers a client-only bundle
# cannot set for itself. TLS is terminated by an upstream proxy, so this listens
# plain on 8080. Build from the repo root: `docker build -f deploy/Dockerfile .`
#
# Bases are pinned by digest; the tag alongside is for readability, the same
# convention this project uses for GitHub Actions.
#
# The serve stage runs no commands, so the arm64 image needs no emulation to
# build: dist/ is architecture-neutral and everything else is a copy.

# --- build stage ------------------------------------------------------------
FROM --platform=$BUILDPLATFORM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS build
WORKDIR /app

# Endpoints are baked at build time (Vite inlines import.meta.env). The https
# guard (deploy/httpsGuard.ts) fails this build if any credential-bearing
# endpoint is a non-localhost cleartext http:// value.
ARG VITE_CP_BASE_URL
ARG VITE_OIDC_ISSUER
ARG VITE_OIDC_CLIENT_ID
ENV VITE_CP_BASE_URL=$VITE_CP_BASE_URL \
    VITE_OIDC_ISSUER=$VITE_OIDC_ISSUER \
    VITE_OIDC_CLIENT_ID=$VITE_OIDC_CLIENT_ID

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Derive the nginx template from the reference header set instead of keeping a
# second copy of the policy — security-headers.conf stays the one place it is
# written, and deploy/headers.test.ts keeps guarding it. Both greps fail the
# build rather than let a moved placeholder ship a CSP whose connect-src is
# never substituted.
RUN grep -q '__CP_ORIGIN__ __OIDC_ORIGIN__ __OBJECT_STORE_ORIGIN__' deploy/security-headers.conf \
 && sed 's|__CP_ORIGIN__ __OIDC_ORIGIN__ __OBJECT_STORE_ORIGIN__|${SL_CSP_CONNECT_SRC}|' \
      deploy/security-headers.conf > /security-headers.conf.template \
 && grep -q '${SL_CSP_CONNECT_SRC}' /security-headers.conf.template

# --- serve stage ------------------------------------------------------------
# nginx-unprivileged rather than stock nginx: it runs as uid 101 with no root
# master process, listens on 8080, and already keeps its pid and temp paths on
# /tmp, so the only writable path the container needs is a tmpfs there.
FROM nginxinc/nginx-unprivileged:1.29-alpine@sha256:0c79d56aee561a1d81c63f00eee5fb5fe29279560cdc55e91425133104c7fbe6 AS serve

ARG VERSION=0.0.0-dev
ARG REVISION=unknown
LABEL org.opencontainers.image.title="SessionLayer Dashboard" \
      org.opencontainers.image.description="Admin dashboard for the SessionLayer Control Plane — a typed client of the OpenAPI contract." \
      org.opencontainers.image.source="https://github.com/SessionLayer/Dashboard" \
      org.opencontainers.image.licenses="GPL-3.0-only" \
      org.opencontainers.image.version="$VERSION" \
      org.opencontainers.image.revision="$REVISION"

COPY --from=build /app/dist /usr/share/nginx/html
COPY --from=build /security-headers.conf.template /etc/nginx/templates/security-headers.conf.template
COPY deploy/nginx-container.conf /etc/nginx/conf.d/default.conf
COPY --chmod=0755 deploy/nginx-envsubst-output-dir.sh /docker-entrypoint.d/05-sl-envsubst-output-dir.sh

# Render the headers onto the tmpfs. Writing them back into /etc/nginx, as an
# entrypoint that patches the shipped config does, fails outright under
# readOnlyRootFilesystem.
ENV NGINX_ENVSUBST_OUTPUT_DIR=/tmp/nginx

# Space-separated CP + OIDC + object-store origins the SPA is allowed to call.
# Declared empty so envsubst always has a value to substitute: an undefined
# variable is left in the rendered file verbatim. Empty collapses connect-src to
# 'self', which blocks every cross-origin call until an operator sets it — a
# loud failure, never a silent widening.
ENV SL_CSP_CONNECT_SRC=""

VOLUME ["/tmp"]

EXPOSE 8080

# Numeric so Kubernetes runAsNonRoot can enforce it without an /etc/passwd lookup.
USER 101:101
