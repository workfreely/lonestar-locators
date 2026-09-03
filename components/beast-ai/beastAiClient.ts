// Beast AI — client integration seam.
//
// This is the ONLY place that talks to the Ask Beast backend. The panel UI
// (AskBeastAI.tsx) consumes the returned object; all retrieval, scoring, the
// system prompt, and credentials live server-side behind /api/beast-ai.

export type BeastAiRole = "user" | "assistant"
export type BeastAiLink = { title: string; url: string }
export type BeastAiMessage = {
  role: BeastAiRole
  content: string
  /** Help Center articles the answer points to (assistant messages only). */
  links?: BeastAiLink[]
  /** Optional related Beast Academy lesson link. */
  video?: string
}
export type BeastAiReply = { reply: string; links?: BeastAiLink[]; video?: string }

// Shown as the first assistant message every time the panel opens.
export const BEAST_AI_WELCOME =
  "Hi! I'm Beast AI. 👋\n\n" +
  "I can help you learn how to use Locator Beast, answer questions, and troubleshoot issues.\n\n" +
  "How can I help today?"

/**
 * Get Beast AI's reply for the current conversation. Sends the conversation to
 * the server-side endpoint, which searches the Help Center knowledge base and
 * composes a grounded answer. Returns the answer plus any Help Center links.
 */
export async function getBeastAiReply(history: BeastAiMessage[]): Promise<BeastAiReply> {
  const res = await fetch("/api/beast-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: history.map((m) => ({ role: m.role, content: m.content })) }),
  })
  if (!res.ok) throw new Error(`Beast AI request failed: ${res.status}`)
  const data = (await res.json()) as { reply: string; articles?: BeastAiLink[]; video?: string }
  return { reply: data.reply, links: data.articles, video: data.video }
}
