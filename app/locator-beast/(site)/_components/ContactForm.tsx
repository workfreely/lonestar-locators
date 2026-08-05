"use client";

import { useState } from "react";

/**
 * Client-side placeholder — not wired to a backend yet. Submitting just
 * shows a confirmation state locally so the UI can be reviewed before any
 * email/API integration is built.
 */
export default function ContactForm() {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="rounded-2xl border border-[var(--beast-border)] bg-[#f7f8fa] p-8 text-center">
        <p className="text-[18px] font-semibold text-[var(--beast-ink)]">Message received.</p>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--beast-ink-soft)]">
          Thanks for reaching out — we&apos;ll get back to you soon.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
      }}
      className="flex flex-col gap-5"
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="name" className="text-[13px] font-medium text-[var(--beast-ink-soft)]">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="rounded-xl border border-[var(--beast-border)] bg-white px-4 py-3 text-[14px] text-[var(--beast-ink)] outline-none transition-colors focus:border-[var(--beast-blue)]"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-[13px] font-medium text-[var(--beast-ink-soft)]">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="rounded-xl border border-[var(--beast-border)] bg-white px-4 py-3 text-[14px] text-[var(--beast-ink)] outline-none transition-colors focus:border-[var(--beast-blue)]"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="message" className="text-[13px] font-medium text-[var(--beast-ink-soft)]">
          Message
        </label>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          className="resize-none rounded-xl border border-[var(--beast-border)] bg-white px-4 py-3 text-[14px] text-[var(--beast-ink)] outline-none transition-colors focus:border-[var(--beast-blue)]"
        />
      </div>

      <button
        type="submit"
        className="mt-2 self-start rounded-full bg-[var(--beast-ink)] px-7 py-3.5 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.03] hover:bg-[var(--beast-blue)]"
      >
        Send Message
      </button>
    </form>
  );
}
