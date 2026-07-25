"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import AuthCard from "../_components/AuthCard";
import GoogleButton from "../_components/GoogleButton";
import Divider from "../_components/Divider";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkEmail, setCheckEmail] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding` },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      router.push("/onboarding");
      router.refresh();
      return;
    }

    // Email confirmation is required before a session exists.
    setCheckEmail(true);
    setLoading(false);
  }

  if (checkEmail) {
    return (
      <AuthCard title="Check your email" subtitle={`We sent a confirmation link to ${email}.`}>
        <p className="text-[14px] leading-relaxed text-[var(--beast-ink-soft)]">
          Click the link to confirm your account and start onboarding.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create your account"
      subtitle="Start your 30-day free trial."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-[var(--beast-blue)] hover:text-[var(--beast-blue-bright)]">
            Log in
          </Link>
        </>
      }
    >
      <GoogleButton next="/onboarding" label="Continue with Google" />
      <Divider />

      <form onSubmit={handleSignup} className="flex flex-col gap-4">
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

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-[13px] font-medium text-[var(--beast-ink-soft)]">
            Password
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

        {error && <p className="text-[13px] text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 w-full rounded-full bg-[var(--beast-ink)] px-7 py-3.5 text-center text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.02] hover:bg-[var(--beast-blue)] disabled:opacity-60"
        >
          {loading ? "Creating account…" : "Create Account"}
        </button>
      </form>
    </AuthCard>
  );
}
