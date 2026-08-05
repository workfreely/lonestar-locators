/**
 * Tiny prefixed logger. Phase-1 diagnostics for the content script lifecycle —
 * every message is namespaced so it's easy to filter the host page's console to
 * `[BeastCompanion]`.
 */
const PREFIX = "[BeastCompanion]";

export const log = (...args: unknown[]): void => console.info(PREFIX, ...args);
export const warn = (...args: unknown[]): void => console.warn(PREFIX, ...args);
export const logError = (...args: unknown[]): void => console.error(PREFIX, ...args);
