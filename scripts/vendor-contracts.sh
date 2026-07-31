#!/usr/bin/env bash
#
# Vendor the OpenAPI contract from SessionLayer/Contracts, pinned by
# contracts.lock (tag + resolved commit SHA). A sibling-checkout-path sync
# would be a silent no-op in CI (CI checks out one repo at a time, so a
# sibling path never exists there), so this script does a REAL git clone of
# the pinned tag instead, and verifies the resolved commit SHA matches
# contracts.lock before copying anything, so a moved/re-pushed tag can't
# silently swap content. Git-only: no GitHub API token, no hosted registry,
# works fully offline once the tag is fetched.
#
# Usage:
#   scripts/vendor-contracts.sh          # fetch + re-vendor, then 'npm run generate:api' + commit
#   scripts/vendor-contracts.sh --check  # fetch + diff only; exit non-zero on drift
set -euo pipefail
cd "$(dirname "$0")/.."

LOCK="contracts.lock"
DST="openapi/openapi.yaml"
mode="${1:-sync}"

repo=$(sed -n 's/^repo=//p' "$LOCK")
tag=$(sed -n 's/^tag=//p' "$LOCK")
want_sha=$(sed -n 's/^sha=//p' "$LOCK")

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

git clone --quiet --depth 1 --branch "$tag" "https://github.com/${repo}.git" "$tmp/src"
got_sha="$(git -C "$tmp/src" rev-parse HEAD)"
if [ "$got_sha" != "$want_sha" ]; then
  echo "DRIFT: ${repo}@${tag} resolves to ${got_sha}, but ${LOCK} pins ${want_sha}." >&2
  echo "       The tag may have moved. Refusing to vendor without a reviewed contracts.lock update." >&2
  exit 1
fi

SRC="$tmp/src/contracts/openapi/openapi.yaml"

case "$mode" in
  --check)
    if diff -u "$DST" "$SRC" >/dev/null 2>&1; then
      echo "in sync: $DST matches ${repo}@${tag}"
    else
      echo "DRIFT: $DST differs from ${repo}@${tag}:contracts/openapi/openapi.yaml" >&2
      diff -u "$DST" "$SRC" >&2 || true
      exit 1
    fi
    ;;
  sync)
    cp "$SRC" "$DST"
    echo "Synced $DST from ${repo}@${tag} (${got_sha:0:12})."
    echo "Next: 'npm run generate:api' then commit openapi/ and src/api/schema.d.ts."
    ;;
  *)
    echo "usage: $0 [--check]" >&2
    exit 2
    ;;
esac
