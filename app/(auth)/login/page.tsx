"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import AuthCard from "../_components/AuthCard";
import GoogleButton from "../_components/GoogleButton";
import Divider from "../_components/Divider";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("onboarding_completed")
      .eq("id", data.user.id)
      .single();

    router.push(profile?.onboarding_completed ? "/admin/leads" : "/onboarding");
    router.refresh();
  }

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Log in to your Locator Beast workspace."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-semibold text-[var(--beast-blue)] hover:text-[var(--beast-blue-bright)]">
            Sign up
          </Link>
        </>
      }
    >
      <GoogleButton next="/onboarding" label="Continue with Google" />
      <Divider />

      <form onSubmit={handleLogin} className="flex flex-col gap-4">
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
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-[13px] font-medium text-[var(--beast-ink-soft)]">
              Password
            </label>
            <Link href="/forgot-password" className="text-[13px] font-medium text-[var(--beast-blue)] hover:text-[var(--beast-blue-bright)]">
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            required
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
          {loading ? "Logging in…" : "Log In"}
        </button>
      </form>
    </AuthCard>
  );
}
