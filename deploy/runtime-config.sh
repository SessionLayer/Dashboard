#!/bin/sh
# Turns the container's endpoint environment into the two things that must agree:
# the /config.js the bundle reads, and the connect-src of the Content-Security-
# Policy nginx sends. One pass writes both, so a runtime endpoint the CSP does
# not allow cannot arise.
#
# Installed as /docker-entrypoint.d/05-sl-runtime-config.envsh. The nginx
# entrypoint SOURCES .envsh files, which is how SL_CSP_CONNECT_SRC reaches
# 20-envsubst-on-templates.sh, and why `exit 1` below ends container startup
# rather than just this script. Refusing to start is the point: the alternative
# is an operator console that loads and reaches nothing.

set -e

SL_OUT_DIR="${NGINX_ENVSUBST_OUTPUT_DIR:-/tmp/nginx}"
sl_violations=''

sl_reject() {
	sl_violations="${sl_violations}
  - $1"
}

# Everything a URL may legally contain, minus the characters that would need
# escaping to sit inside a double-quoted JS string. Refusing is safer than
# escaping: no value we accept can close the string it is written into. grep is
# line-based, so a newline has to be caught separately.
sl_unsafe() {
	[ "$(printf '%s' "$1" | wc -l)" -eq 0 ] || return 0
	printf '%s' "$1" | LC_ALL=C grep -q "[^]A-Za-z0-9._~:/?#@!\$&'()*+,;=%[-]"
}

sl_scheme() {
	printf '%s' "${1%%://*}" | tr 'A-Z' 'a-z'
}

sl_host() {
	sl_h=${1#*://}
	sl_h=${sl_h%%[/?#]*}
	sl_h=${sl_h##*@}
	case "$sl_h" in
	'['*) printf '%s]' "${sl_h%%]*}" ;;
	*) printf '%s' "${sl_h%%:*}" ;;
	esac
}

# scheme://host[:port], with the scheme's default port dropped - a CSP
# host-source with an explicit :443 does not match an origin written without it.
sl_origin() {
	sl_o_scheme=$(sl_scheme "$1")
	sl_o_auth=${1#*://}
	sl_o_auth=${sl_o_auth%%[/?#]*}
	sl_o_auth=${sl_o_auth##*@}
	sl_o_auth=$(printf '%s' "$sl_o_auth" | tr 'A-Z' 'a-z')
	case "$sl_o_scheme:$sl_o_auth" in
	https:*:443) sl_o_auth=${sl_o_auth%:443} ;;
	http:*:80) sl_o_auth=${sl_o_auth%:80} ;;
	esac
	printf '%s://%s' "$sl_o_scheme" "$sl_o_auth"
}

# The same rule deploy/httpsGuard.ts applies to a baked build, applied where the
# value now arrives. deploy/runtimeConfig.test.ts runs both over one table of
# cases so they cannot drift apart.
sl_check() {
	sl_c_name=$1
	sl_c_value=$2
	[ -n "$sl_c_value" ] || return 0
	if sl_unsafe "$sl_c_value"; then
		sl_reject "$sl_c_name contains characters no URL may contain (got \"$sl_c_value\")"
		return 0
	fi
	case "$sl_c_value" in
	*://*) ;;
	*)
		sl_reject "$sl_c_name must be a valid https:// URL (got \"$sl_c_value\")"
		return 0
		;;
	esac
	if [ -z "$(sl_host "$sl_c_value")" ]; then
		sl_reject "$sl_c_name must be a valid https:// URL (got \"$sl_c_value\")"
		return 0
	fi
	case "$(sl_host "$sl_c_value")" in
	localhost | 127.0.0.1 | '[::1]') return 0 ;;
	esac
	[ "$(sl_scheme "$sl_c_value")" = https ] ||
		sl_reject "$sl_c_name must be https:// (got \"$sl_c_value\"). A cleartext endpoint carries the bearer token in the clear."
}

# Vite inlines VITE_ values into the bundle at build time, so setting one here
# does nothing. An operator who does that has configured the console and would
# get one pointed at their own browser instead; say so rather than start.
for sl_legacy in VITE_CP_BASE_URL VITE_OIDC_ISSUER VITE_OIDC_CLIENT_ID \
	VITE_OIDC_AUTHORIZE_ENDPOINT VITE_OIDC_TOKEN_ENDPOINT VITE_OIDC_REDIRECT_URI \
	VITE_OIDC_SCOPE; do
	eval "sl_legacy_value=\${$sl_legacy:-}"
	[ -z "$sl_legacy_value" ] ||
		sl_reject "$sl_legacy is a build-time variable and has no effect on a running container. Use SL_${sl_legacy#VITE_}."
done
[ -z "${SL_CSP_CONNECT_SRC:-}" ] ||
	sl_reject "SL_CSP_CONNECT_SRC is no longer an input: connect-src is derived from the endpoints below, so the two cannot disagree. Name the object store in SL_OBJECT_STORE_ORIGIN."

if [ -z "${SL_CP_BASE_URL:-}" ]; then
	sl_reject "SL_CP_BASE_URL is unset. The image carries no endpoint of its own, so this container would serve a console that reaches nothing."
fi

sl_issuer=$(printf '%s' "${SL_OIDC_ISSUER:-}" | sed 's|/*$||')
sl_authorize="${SL_OIDC_AUTHORIZE_ENDPOINT:-}"
sl_token="${SL_OIDC_TOKEN_ENDPOINT:-}"
if [ -n "$sl_issuer" ]; then
	[ -n "$sl_authorize" ] || sl_authorize="$sl_issuer/authorize"
	[ -n "$sl_token" ] || sl_token="$sl_issuer/oauth2/token"
fi

sl_check SL_CP_BASE_URL "${SL_CP_BASE_URL:-}"
sl_check SL_OIDC_ISSUER "$sl_issuer"
sl_check SL_OIDC_AUTHORIZE_ENDPOINT "$sl_authorize"
sl_check SL_OIDC_TOKEN_ENDPOINT "$sl_token"
sl_check SL_OIDC_REDIRECT_URI "${SL_OIDC_REDIRECT_URI:-}"

# The browser downloads the still-encrypted recording straight from the signed
# URL, so the store's origin has to be named: it is the one origin the app
# fetches that is not one of its own endpoints.
sl_connect=''
sl_add_origin() {
	[ -n "$1" ] || return 0
	case " $sl_connect " in
	*" $1 "*) return 0 ;;
	esac
	sl_connect="${sl_connect:+$sl_connect }$1"
}
# Unquoted on purpose - the list is space-separated - with pathname expansion
# off, because '*' is legal in a CSP host-source and would otherwise glob.
set -f
for sl_store in ${SL_OBJECT_STORE_ORIGIN:-}; do
	sl_check SL_OBJECT_STORE_ORIGIN "$sl_store"
done

sl_client_id="${SL_OIDC_CLIENT_ID:-sessionlayer-dashboard}"
sl_scope="${SL_OIDC_SCOPE:-openid profile email}"
if printf '%s' "$sl_client_id" | LC_ALL=C grep -q "[^A-Za-z0-9._~:@-]"; then
	sl_reject "SL_OIDC_CLIENT_ID may only contain unreserved URL characters (got \"$sl_client_id\")"
fi
if printf '%s' "$sl_scope" | LC_ALL=C grep -q "[^A-Za-z0-9._~:/ -]"; then
	sl_reject "SL_OIDC_SCOPE may only contain space-separated OAuth scope tokens (got \"$sl_scope\")"
fi

if [ -n "$sl_violations" ]; then
	printf '\n[sessionlayer] refusing to start - the endpoint environment is not usable:%s\n\n' \
		"$sl_violations" >&2
	printf '[sessionlayer] Set SL_CP_BASE_URL, and any SL_OIDC_* endpoint, to an https:// URL (loopback may be http). See deploy/README.md.\n\n' >&2
	exit 1
fi

sl_add_origin "$(sl_origin "$SL_CP_BASE_URL")"
[ -z "$sl_token" ] || sl_add_origin "$(sl_origin "$sl_token")"
for sl_store in ${SL_OBJECT_STORE_ORIGIN:-}; do
	sl_add_origin "$(sl_origin "$sl_store")"
done
set +f

mkdir -p "$SL_OUT_DIR"
cat > "$SL_OUT_DIR/config.js" <<EOF
// Written at container start by /docker-entrypoint.d/05-sl-runtime-config.envsh.
// Editing it here changes nothing: the next start overwrites it from the
// SL_* environment, which is the only place a deployment's endpoints live.
window.__SL_RUNTIME_CONFIG__ = Object.freeze({
  "CP_BASE_URL": "$SL_CP_BASE_URL",
  "OIDC_ISSUER": "$sl_issuer",
  "OIDC_CLIENT_ID": "$sl_client_id",
  "OIDC_AUTHORIZE_ENDPOINT": "$sl_authorize",
  "OIDC_TOKEN_ENDPOINT": "$sl_token",
  "OIDC_REDIRECT_URI": "${SL_OIDC_REDIRECT_URI:-}",
  "OIDC_SCOPE": "$sl_scope"
});
EOF

SL_CSP_CONNECT_SRC="$sl_connect"
export SL_CSP_CONNECT_SRC
printf '[sessionlayer] Control Plane %s; connect-src %s\n' \
	"$SL_CP_BASE_URL" "'self' $SL_CSP_CONNECT_SRC"

unset sl_violations sl_h sl_o_scheme sl_o_auth sl_c_name sl_c_value \
	sl_legacy sl_legacy_value sl_issuer sl_authorize sl_token sl_connect \
	sl_store sl_client_id sl_scope
