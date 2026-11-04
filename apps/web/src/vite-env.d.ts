/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" in end-to-end builds: exposes the realtime store as `window.__dtStore`. */
  readonly VITE_E2E?: string;
}
