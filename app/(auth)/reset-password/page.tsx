"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import AuthCard from "../_components/AuthCard";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setDone(true);
    setTimeout(() => {
      router.push("/login");
    }, 1800);
  }

  if (done) {
    return (
      <AuthCard title="Password updated" subtitle="Redirecting you to log in…" />
    );
  }

  return (
    <AuthCard title="Set a new password" subtitle="Choose a new password for your account.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-[13px] font-medium text-[var(--beast-ink-soft)]">
            New password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border border-[var(--beast-border)] bg-white px-4 py-3 text-[14px] text-[var(--beast-ink)] outline-none transition-colors focus:border-[var(--beast-blue)]"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="confirmPassword" className="text-[13px] font-medium text-[var(--beast-ink-soft)]">
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="rounded-xl border border-[var(--beast-border)] bg-white px-4 py-3 text-[14px] text-[var(--beast-ink)] outline-none transition-colors focus:border-[var(--beast-blue)]"
          />
        </div>

        {error && <p className="text-[13px] text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 w-full rounded-full bg-[var(--beast-ink)] px-7 py-3.5 text-center text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.02] hover:bg-[var(--beast-blue)] disabled:opacity-60"
        >
          {loading ? "Updating…" : "Update Password"}
        </button>
      </form>
    </AuthCard>
  );
}
