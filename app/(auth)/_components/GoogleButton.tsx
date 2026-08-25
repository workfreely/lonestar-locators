"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { supabase } from "@/lib/supabase/client";
import { createNoncePair } from "@/lib/auth/googleNonce";

export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.7-3.87 2.7-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58Z"
      />
    </svg>
  );
}

// Minimal shape of the bits of Google Identity Services we actually call. The
// full library is untyped here on purpose — declaring only what we use keeps the
// contract visible and stops a wrong field name from compiling.
type GisCredentialResponse = { credential?: string };
type Gis = {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (r: GisCredentialResponse) => void;
        nonce: string;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
      }) => void;
      renderButton: (
        parent: HTMLElement,
        options: Record<string, string | number>
      ) => void;
    };
  };
};

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_LOGIN_CLIENT_ID;

export default function GoogleButton({
  next = "/onboarding",
  label = "Continue with Google",
}: {
  next?: string;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Falling back means "render the original button that does the redirect flow".
  // We start in fallback whenever GIS cannot possibly work (no client id) and
  // switch into it if anything about GIS fails at runtime, so a broken script,
  // an unregistered origin, or a blocked third-party context can never leave the
  // user with no way to sign in.
  const [useFallback, setUseFallback] = useState(!CLIENT_ID);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderedRef = useRef(false);

  // ── The preserved redirect flow — unchanged from before GIS ────────────────
  const signInWithRedirect = useCallback(async () => {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
  }, [next]);

  const handleCredential = useCallback(
    async (response: GisCredentialResponse, rawNonce: string) => {
      const token = response.credential;
      if (!token) {
        setUseFallback(true);
        return;
      }
      setLoading(true);
      setError(null);

      // The RAW nonce goes to Supabase; Google already received the hash.
      const { error: signInError } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token,
        nonce: rawNonce,
      });

      if (signInError) {
        // Do NOT silently fall back here: the user completed a Google prompt, so
        // dropping them into a second, different-looking flow is disorienting.
        // Surface it and leave the redirect button available underneath.
        setLoading(false);
        setError("Google sign-in could not be completed. Please try again.");
        setUseFallback(true);
        return;
      }

      // Session cookies are written by the browser client at this point. Claim
      // the referral the same way /auth/callback does for the redirect flow —
      // best-effort, and never allowed to block the sign-in.
      try {
        await fetch("/api/auth/claim-referral", { method: "POST" });
      } catch {
        // /onboarding claims from the same cookie as a backstop.
      }

      // A full navigation rather than a client-side push: server components and
      // middleware must read the freshly written session cookies on this hop.
      window.location.assign(next);
    },
    [next]
  );

  const initGis = useCallback(async () => {
    if (renderedRef.current || !CLIENT_ID) return;
    const gis = (window as unknown as { google?: Gis }).google;
    const parent = containerRef.current;
    if (!gis?.accounts?.id || !parent) {
      setUseFallback(true);
      return;
    }

    try {
      // Google renders into `parent`, and it needs an explicit pixel width — it
      // cannot inherit `w-full`. Reading offsetWidth synchronously here returns 0
      // (the node is empty and layout has not settled when Script.onReady fires),
      // which silently fell back to Google's 360px default and left the button
      // narrower than every other field. Wait one frame so the real width exists.
      //
      // Deliberately NOT a ResizeObserver: it does not fire in every embedded
      // browser we preview in, so a frame wait plus the resize listener below is
      // the reliable pair.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      // One fresh nonce pair per mount — see lib/auth/googleNonce.ts.
      const { raw, hashed } = await createNoncePair();

      gis.accounts.id.initialize({
        client_id: CLIENT_ID,
        nonce: hashed,
        callback: (r) => void handleCredential(r, raw),
        // No One Tap auto-sign-in: this button is an explicit action, and
        // auto_select would sign a returning visitor in without them asking.
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      gis.accounts.id.renderButton(parent, {
        // All of these are Google's own supported options — nothing here styles
        // the rendered iframe. `shape: "rectangular"` (GIS supports rectangular
        // | pill | circle | square) is the closest supported match to the form's
        // rounded inputs; the pill read as a different control sitting above a
        // stack of rectangles.
        //
        // `size: "large"` is Google's maximum, which is a 40px-tall button. It
        // cannot be pushed to the 52px of the Log In button without transforming
        // Google's own artwork, so the height difference stays.
        //
        // `type: "standard"` is what enables the personalized "Continue as
        // <name>" state — Google decides when to show it, from the visitor's own
        // Google session. Switching to "icon" would lose it.
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "center",
        width: Math.round(parent.getBoundingClientRect().width) || 360,
      });
      renderedRef.current = true;
    } catch {
      setUseFallback(true);
    }
  }, [handleCredential]);

  // Covers the case where the script was already loaded by a previous mount, in
  // which case Script's onReady may not fire again.
  useEffect(() => {
    if (!useFallback && (window as unknown as { google?: Gis }).google) void initGis();
  }, [initGis, useFallback]);

  // Google bakes the width into the rendered button, so a viewport change would
  // otherwise leave it stranded at its old size. Clearing the guard and calling
  // initGis again re-renders it at the new width.
  useEffect(() => {
    if (useFallback) return;
    let frame = 0;
    function onResize() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const parent = containerRef.current;
        if (!parent) return;
        parent.innerHTML = "";
        renderedRef.current = false;
        void initGis();
      });
    }
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(frame);
    };
  }, [initGis, useFallback]);

  if (useFallback) {
    return (
      <div className="flex w-full flex-col gap-2">
        <button
          type="button"
          onClick={signInWithRedirect}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-[var(--beast-blue)] bg-white px-6 py-3 text-[14px] font-semibold text-[var(--beast-ink)] transition-colors hover:bg-[#f7f8fa] disabled:opacity-60"
        >
          <GoogleIcon />
          {loading ? "Redirecting…" : label}
        </button>
        {error && <p className="text-[12px] text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => void initGis()}
        onError={() => setUseFallback(true)}
      />
      {/* Google renders its own button into this node. Sign in with Google
          branding requires Google's rendered button, so this is intentionally
          not our custom markup — the custom button survives as the fallback. */}
      <div ref={containerRef} className="flex w-full justify-center [&>div]:!w-full" />
      {loading && <p className="text-center text-[12px] text-[var(--beast-ink-soft)]">Signing in…</p>}
      {error && <p className="text-[12px] text-red-500">{error}</p>}
    </div>
  );
}
