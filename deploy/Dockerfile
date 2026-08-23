# syntax=docker/dockerfile:1
# SessionLayer Dashboard - production image: build the static bundle, then serve
# dist/ behind nginx with the strict security headers a client-only bundle
# cannot set for itself. TLS is terminated by an upstream proxy, so this listens
# plain on 8080. Build from the repo root: `docker build -f deploy/Dockerfile .`
#
# No endpoint is baked in. The image reads its Control Plane, identity provider
# and object-store endpoints from SL_* environment at container start, so one
# published image serves any deployment - see deploy/runtime-config.sh.
#
# The serve stage runs no commands, so the arm64 image needs no emulation to
# build: dist/ is architecture-neutral and everything else is a copy.

FROM --platform=$BUILDPLATFORM node:26-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019 AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Derive the nginx template from the reference header set instead of keeping a
# second copy of the policy - security-headers.conf stays the one place it is
# written, and deploy/headers.test.ts keeps guarding it. Both greps fail the
# build rather than let a moved placeholder ship a CSP whose connect-src is
# never substituted.
RUN grep -q '__CP_ORIGIN__ __OIDC_ORIGIN__ __OBJECT_STORE_ORIGIN__' deploy/security-headers.conf \
 && sed 's|__CP_ORIGIN__ __OIDC_ORIGIN__ __OBJECT_STORE_ORIGIN__|${SL_CSP_CONNECT_SRC}|' \
      deploy/security-headers.conf > /security-headers.conf.template \
 && grep -q '${SL_CSP_CONNECT_SRC}' /security-headers.conf.template

FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:334d92979f15aaecd5dd50af5105e1230e2bb70765d45b1e2f964e7c5eda81c3 AS serve

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

# .envsh, not .sh: the nginx entrypoint sources these, so the SL_CSP_CONNECT_SRC
# this one derives reaches 20-envsubst-on-templates.sh, and a refusal here ends
# startup instead of leaving nginx to serve a console with no endpoints.
COPY --chmod=0755 deploy/runtime-config.sh /docker-entrypoint.d/05-sl-runtime-config.envsh

# Render onto the tmpfs. Writing back into /etc/nginx, as an entrypoint that
# patches the shipped config does, fails outright under readOnlyRootFilesystem.
ENV NGINX_ENVSUBST_OUTPUT_DIR=/tmp/nginx

VOLUME ["/tmp"]

EXPOSE 8080

# Numeric so Kubernetes runAsNonRoot can enforce it without an /etc/passwd lookup.
USER 101:101
