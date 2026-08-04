#!/bin/sh
# Runs before nginx's own 20-envsubst-on-templates.sh, which renders the
# security headers into NGINX_ENVSUBST_OUTPUT_DIR. That script never creates the
# directory, and when it is missing it logs and returns 0 rather than failing —
# so without this the container would start with no rendered headers at all.
# Under a read-only root filesystem the output directory is on the /tmp tmpfs,
# which is empty on every container start.
set -e
mkdir -p "${NGINX_ENVSUBST_OUTPUT_DIR:-/tmp/nginx}"
