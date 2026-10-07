// The delivery canvas, in a module with NO server-only imports.
//
// lib/social/renderVideo.ts also exports DELIVERY, but that module pulls in node:child_process and
// node:fs, so a client component cannot import from it. This is the same two numbers, importable
// from the browser. renderVideo re-exports from here so there is still one definition.
export const DELIVERY_SIZE = { w: 1080, h: 1920 } as const
