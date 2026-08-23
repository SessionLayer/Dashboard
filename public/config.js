// Endpoint configuration, read by the bundle before it starts.
//
// The container image overwrites this at start from its SL_* environment
// (deploy/runtime-config.sh), which is how one image serves two deployments. A
// build that bakes VITE_ endpoints - a static host - leaves it empty and the
// bundle reads its compiled-in values instead.
window.__SL_RUNTIME_CONFIG__ = Object.freeze({});
