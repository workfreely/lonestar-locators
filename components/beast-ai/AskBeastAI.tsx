"use client";

import { useEffect, useRef, useState } from "react";
import {
  getBeastAiReply,
  BEAST_AI_WELCOME,
  type BeastAiMessage,
} from "./beastAiClient";

// Ask Beast AI — a small floating support widget for Locator Beast surfaces.
// Mounted structurally inside each LB layout (marketing, CRM, onboarding,
// billing, smart-lead-form) — never in the neutral root or (lonestar), so it is
// present on Locator Beast pages and absent on Lone Star by construction.
//
// Self-contained dark theme via literal hex (the --beast-* CSS vars aren't
// loaded on every LB surface, e.g. the CRM), so it looks identical everywhere.
export default function AskBeastAI() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<BeastAiMessage[]>([
    { role: "assistant", content: BEAST_AI_WELCOME },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, open, sending]);

  // Focus the input when the panel opens; Escape closes it.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const history: BeastAiMessage[] = [...messages, { role: "user", content: text }];
    setMessages(history);
    setInput("");
    setSending(true);
    try {
      const reply = await getBeastAiReply(history);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Floating trigger — small, unobtrusive, no idle animation. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask Beast AI"
        aria-expanded={open}
        className={`fixed bottom-5 right-5 z-[10000] flex items-center gap-2 rounded-full border border-white/10 bg-[#0b0f1a] px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_10px_30px_-8px_rgba(0,0,0,0.5)] transition-[opacity,transform,background-color] duration-200 hover:bg-[#141a2b] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b8bff] ${
          open ? "pointer-events-none scale-95 opacity-0" : "opacity-100"
        }`}
      >
        <SparkIcon className="h-4 w-4 text-[#5b8bff]" />
        Ask Beast AI
      </button>

      {/* Slide-in panel */}
      <section
        role="dialog"
        aria-label="Ask Beast AI"
        aria-hidden={!open}
        className={`fixed bottom-5 right-5 z-[10000] flex w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f1a] text-white shadow-[0_24px_70px_-20px_rgba(0,0,0,0.7)] transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none ${
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-3 opacity-0"
        }`}
        style={{ height: "min(600px, calc(100dvh - 2.5rem))" }}
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-white/10 bg-[#05070d] px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[#2f6bff]/15">
              <SparkIcon className="h-4 w-4 text-[#5b8bff]" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold leading-tight">Ask Beast AI</h2>
              <p className="mt-0.5 text-[12.5px] text-white/60">Get instant help using Locator Beast.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {/* Transcript */}
        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((m, i) => (
            <MessageBubble key={i} role={m.role} content={m.content} />
          ))}
          {sending && <TypingIndicator />}
        </div>

        {/* Composer */}
        <form onSubmit={handleSend} className="border-t border-white/10 bg-[#05070d] px-3 py-3">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              aria-label="Message Beast AI"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0b0f1a] px-3.5 py-2.5 text-[13.5px] text-white placeholder-white/35 outline-none transition-colors focus:border-[#2f6bff]"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              aria-label="Send"
              className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-[#2f6bff] text-white transition-colors hover:bg-[#5b8bff] disabled:opacity-40"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2.5 8h9M8 4.5L11.5 8 8 11.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

function MessageBubble({ role, content }: { role: BeastAiMessage["role"]; content: string }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed ${
          isUser
            ? "bg-[#2f6bff] text-white"
            : "bg-white/[0.06] text-white/90"
        }`}
      >
        {content}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start" aria-label="Beast AI is typing">
      <div className="flex items-center gap-1 rounded-2xl bg-white/[0.06] px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/50"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2l1.6 5.9L19.5 9l-5.9 1.6L12 16.5l-1.6-5.9L4.5 9l5.9-1.5L12 2z" />
      <path d="M18.5 14l.8 2.7L22 17.5l-2.7.8L18.5 21l-.8-2.7L15 17.5l2.7-.8.8-2.7z" opacity="0.7" />
    </svg>
  );
}
