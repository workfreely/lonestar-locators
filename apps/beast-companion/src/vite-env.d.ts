/// <reference types="vite/client" />
/// <reference types="chrome" />

// Vite's `?inline` query returns the stylesheet as a string. `vite/client`
// already declares this, but we keep the reference explicit for clarity.

/** Build-time flag injected by scripts/build.mjs. True ONLY for --watch (local
 *  development) builds; production builds inline `false` so any branch guarded by
 *  it is removed from the shipped bundle. */
declare const __LB_DEV__: boolean
