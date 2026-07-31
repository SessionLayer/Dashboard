/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Absolute base URL of the Control Plane REST API. Defaults to the local
   * single-instance Control Plane (`http://localhost:8080`). Set at build time to
   * point the dashboard at a deployed Control Plane.
   */
  readonly VITE_CP_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
