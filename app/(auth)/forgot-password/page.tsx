"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import AuthCard from "../_components/AuthCard";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    // Always show a generic success state, whether or not the email is
    // registered, so this can't be used to enumerate accounts.
    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <AuthCard title="Check your email" subtitle={`If an account exists for ${email}, a reset link is on its way.`}>
        <Link
          href="/login"
          className="block w-full rounded-full border border-[var(--beast-border)] px-7 py-3.5 text-center text-[15px] font-semibold text-[var(--beast-ink)] transition-colors hover:bg-[#f7f8fa]"
        >
          Back to Log In
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Forgot password?"
      subtitle="Enter your email and we'll send you a reset link."
      footer={
        <Link href="/login" className="font-semibold text-[var(--beast-blue)] hover:text-[var(--beast-blue-bright)]">
          Back to Log In
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-[13px] font-medium text-[var(--beast-ink-soft)]">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border border-[var(--beast-border)] bg-white px-4 py-3 text-[14px] text-[var(--beast-ink)] outline-none transition-colors focus:border-[var(--beast-blue)]"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-2 w-full rounded-full bg-[var(--beast-ink)] px-7 py-3.5 text-center text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.02] hover:bg-[var(--beast-blue)] disabled:opacity-60"
        >
          {loading ? "Sending…" : "Send Reset Link"}
        </button>
      </form>
    </AuthCard>
  );
}
