// The generic client-facing skyline asset path.
//
// Split out of ./skyline so it can be imported from a CLIENT component. skyline.ts also exports
// skylineDataUri(), which reads the file with node:fs/promises for the Open Graph image — pulling
// that into a browser chunk fails the build. The path itself is just a string, and both the server
// helper and the editor's Thank You preview need it.
//
// TO CHANGE THE ARTWORK: replace the file at this path. Nothing else needs to change.
export const SKYLINE_PATH = "/locator-beast/brand/recommendations-skyline.jpg"
