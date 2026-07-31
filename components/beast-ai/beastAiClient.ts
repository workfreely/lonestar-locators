// Beast AI — client integration seam.
//
// This is the ONLY place that needs to change to connect a real LLM. The panel
// UI (AskBeastAI.tsx) consumes just the returned string, so wiring a backend
// later requires no UI changes.

export type BeastAiRole = "user" | "assistant";
export type BeastAiMessage = { role: BeastAiRole; content: string };

// Flip to true once a backend (e.g. POST /api/beast-ai) is live.
export const BEAST_AI_CONNECTED = false;

// Shown as the first assistant message every time the panel opens.
export const BEAST_AI_WELCOME =
  "Hi! I'm Beast AI. 👋\n\n" +
  "I can help you learn how to use Locator Beast, answer questions, and troubleshoot issues.\n\n" +
  "How can I help today?";

// Shown as the reply while no backend is connected.
export const BEAST_AI_COMING_SOON = "Beast AI is coming soon.";

/**
 * Get Beast AI's reply for the current conversation. Today it returns a
 * placeholder; to connect an LLM later, set BEAST_AI_CONNECTED = true and
 * replace the body below with a real call — the signature and return type
 * (a plain string) stay the same, so the panel UI is untouched.
 */
export async function getBeastAiReply(history: BeastAiMessage[]): Promise<string> {
  if (!BEAST_AI_CONNECTED) {
    // Small, honest delay so the "typing" state is visible; real latency
    // replaces this once the backend is wired.
    await new Promise((r) => setTimeout(r, 450));
    return BEAST_AI_COMING_SOON;
  }

  // ── Future wiring (no UI changes needed) ─────────────────────────────────
  // const res = await fetch("/api/beast-ai", {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify({ messages: history }),
  // });
  // if (!res.ok) throw new Error(`Beast AI request failed: ${res.status}`);
  // const data = (await res.json()) as { reply: string };
  // return data.reply;

  return BEAST_AI_COMING_SOON;
}
