// THE SWITCH FOR AUTOMATIC TIKTOK SIBLING CREATION — its own module, like bufferGate.
//
// Separate from siblingAutoCreate.ts for the same reason bufferGate is separate from bufferServer:
// that module is `server-only`, which makes it unimportable from a test runner, and a switch whose
// semantics cannot be asserted directly is a switch nobody has checked. "Missing means no" is the
// whole behaviour, and it is the kind of thing that must be tested rather than read.
export function siblingAutoCreateEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.SOCIAL_TIKTOK_SIBLING_AUTOCREATE ?? "").trim() === "true"
}

/**
 * A cap on one run, so a plan with a long horizon cannot fan out into dozens of rows and renders.
 * Deliberately small: the daily need is two, and anything much larger means something else is
 * wrong and should be looked at rather than absorbed.
 */
export const MAX_SIBLINGS_PER_RUN = 6
