# Reference container image for the Control Plane Dashboard: build the static
# bundle, then serve dist/ behind nginx with the strict security headers. TLS is
# terminated by an upstream proxy/LB, so this listens plain on 8080. Build from
# the repo root: `docker build -f deploy/Dockerfile .`. See deploy/README.md.

# --- build stage ------------------------------------------------------------
FROM node:22-alpine AS build
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

# --- serve stage ------------------------------------------------------------
FROM nginx:1.27-alpine AS serve

# Strict security headers, shared with the reverse-proxy reference.
COPY deploy/security-headers.conf /etc/nginx/security-headers.conf

# Minimal server: plain 8080 (TLS upstream), SPA fallback, immutable asset cache.
# The security-headers include is repeated per-location because nginx drops
# inherited add_header directives in any block that sets its own.
RUN printf '%s\n' \
  'server {' \
  '  listen 8080;' \
  '  root /usr/share/nginx/html;' \
  '  index index.html;' \
  '  include security-headers.conf;' \
  '  location /assets/ {' \
  '    include security-headers.conf;' \
  '    add_header Cache-Control "public, max-age=31536000, immutable" always;' \
  '    try_files $uri =404;' \
  '  }' \
  '  location / {' \
  '    include security-headers.conf;' \
  '    add_header Cache-Control "no-store" always;' \
  '    try_files $uri /index.html;' \
  '  }' \
  '}' > /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

# Fill the connect-src allow-list from the environment at container start (the
# nginx:alpine entrypoint runs /docker-entrypoint.d/*.sh before launching).
# SL_CSP_CONNECT_SRC = space-separated CP + OIDC + object-store origins; an unset
# value collapses connect-src to 'self' (fail-closed: cross-origin calls blocked
# until an operator sets it — a loud failure, never a silent downgrade).
RUN printf '%s\n' \
  '#!/bin/sh' \
  'set -e' \
  'sed -i "s|__CP_ORIGIN__ __OIDC_ORIGIN__ __OBJECT_STORE_ORIGIN__|${SL_CSP_CONNECT_SRC:-}|g" /etc/nginx/security-headers.conf' \
  > /docker-entrypoint.d/40-sl-connect-src.sh \
  && chmod +x /docker-entrypoint.d/40-sl-connect-src.sh

EXPOSE 8080
