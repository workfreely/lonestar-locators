/**
 * Milestone B — Companion auth crypto/primitive security tests. No DB/network.
 *   npx tsx scripts/tests/companion-auth-crypto.test.ts
 */
import {
  mintToken,
  sha256Hex,
  safeEqual,
  generateCodeVerifier,
  codeChallengeS256,
  verifyPkce,
  ACCESS_TOKEN_PREFIX,
  REFRESH_TOKEN_PREFIX,
} from "@/lib/companion/tokens";

let pass = 0,
  fail = 0;
const ok = (c: boolean, n: string, e = "") => {
  c ? pass++ : fail++;
  console.log(`${c ? "✓" : "✗"} ${n}${c ? "" : `  ${e}`}`);
};

// ── PKCE ──────────────────────────────────────────────────────────────────────
const verifier = generateCodeVerifier();
const challenge = codeChallengeS256(verifier);
ok(verifyPkce(verifier, challenge), "PKCE: correct verifier matches its challenge");
ok(!verifyPkce(generateCodeVerifier(), challenge), "PKCE: a different verifier is rejected");
ok(!verifyPkce(verifier + "x", challenge), "PKCE: tampered verifier is rejected");
ok(!verifyPkce("", challenge) && !verifyPkce(verifier, ""), "PKCE: empty inputs rejected");

// ── Opaque tokens + hashing ────────────────────────────────────────────────────
const a = mintToken(ACCESS_TOKEN_PREFIX);
const r = mintToken(REFRESH_TOKEN_PREFIX);
ok(a.raw.startsWith("lbxa_") && r.raw.startsWith("lbxr_"), "mint: correct client-family prefixes");
ok(a.hash === sha256Hex(a.raw) && a.hash.length === 64, "mint: hash = sha256(raw), 64 hex chars");
ok(a.raw !== a.hash, "mint: stored hash is not the raw secret");
ok(mintToken(ACCESS_TOKEN_PREFIX).raw !== mintToken(ACCESS_TOKEN_PREFIX).raw, "mint: tokens are unique/random");
ok(sha256Hex("x") === sha256Hex("x") && sha256Hex("x") !== sha256Hex("y"), "hash: deterministic + collision-free for distinct inputs");

// ── constant-time compare ───────────────────────────────────────────────────────
ok(safeEqual("abc", "abc") && !safeEqual("abc", "abd") && !safeEqual("abc", "abcd"), "safeEqual: matches equal, rejects different/length");

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
