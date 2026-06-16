import Anthropic from "@anthropic-ai/sdk"

export type AiInsightsResponse = {
  insights: string[]
  last_conversation: string
}

const SYSTEM_PROMPT = `You are an assistant that extracts non-CRM context from apartment locator client conversations.

The CRM already tracks: budget, move date, desired bedrooms/bathrooms, neighborhood preferences, lease term, pets, application status, and contact history.

Do NOT surface anything the CRM already stores. Surface only:
- Client personality, communication style, or rapport notes
- Emotional context or life circumstances behind the move
- Specific opinions on properties already toured (what they liked or disliked and why)
- Objections or hesitations not captured in structured CRM fields
- Significant situation changes mentioned in conversation (job change, family news, urgency shift)
- Preferred communication style or scheduling quirks

Language rules:
- Use professional real-estate language at all times.
- Never write phrases like "lead appears lost", "lead is gone", "lead dropped off", or similar. Instead use: "client is no longer actively searching", "client found another housing option", "client placed their search on hold", "client secured housing elsewhere", or equivalent professional phrasing.
- Refer to the person as "client", never "lead".

Output rules:
- Return a JSON object with exactly two keys: "insights" and "last_conversation"
- "insights": array of 0–4 strings. Each must be one clear, specific sentence of around 12–18 words. Avoid long compound sentences, filler words, and vague statements. Do not make bullets so short they lose useful context. Good: "Client preferred apartments over townhomes as the safer option." Bad: "Client was open to either an apartment or townhouse but leaned toward an apartment as the safer option."
- "last_conversation": one sentence describing where the conversation left off (e.g. "Waiting for client to confirm pet deposit amount before submitting application.")
- Return raw JSON only. Do not wrap the response in markdown code fences. Do not include any explanation or extra text before or after the JSON.`

export async function generateAiInsights(
  transcript: string
): Promise<AiInsightsResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set in environment variables")
  }

  const client = new Anthropic({ apiKey })

  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Here is the conversation transcript:\n\n${transcript}`,
      },
    ],
  })

  const textBlock = message.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in AI response")
  }

  const raw = textBlock.text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.error("[generateAiInsights] Raw AI response that failed to parse:\n", textBlock.text)
    throw new Error("AI returned a response that could not be parsed. Check server logs for details.")
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>).insights) ||
    typeof (parsed as Record<string, unknown>).last_conversation !== "string"
  ) {
    throw new Error("AI response does not match expected shape")
  }

  const result = parsed as { insights: unknown[]; last_conversation: string }

  const insights = result.insights
    .filter((i): i is string => typeof i === "string" && i.trim().length > 0)
    .slice(0, 4)

  return {
    insights,
    last_conversation: result.last_conversation.trim(),
  }
}
