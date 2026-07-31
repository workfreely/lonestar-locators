"use client";

import { buildInsights, type DemoLead } from "@/app/locator-beast/demo/_data/demo";

// Demo #3 — a read-only sample AI Client Insights panel. No prompts, no
// regeneration, no editing, no backend details — just the polished output.
export default function DemoAIClientInsights({ lead }: { lead: DemoLead }) {
  const insights = buildInsights(lead);

  return (
    <div className="mx-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0b0f1a] p-6 sm:p-7">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--beast-blue)]/15 text-[var(--beast-blue-bright)]">
            <SparkIcon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[14.5px] font-semibold text-white">AI Client Insights</p>
            <p className="text-[12px] text-white/45">{lead.name}</p>
          </div>
        </div>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/45">
          Read-only
        </span>
      </div>

      {/* Approval probability + recommended budget */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-white/40">Approval Probability</p>
            <span className="text-[12px] font-semibold text-emerald-400">{insights.approvalLabel}</span>
          </div>
          <p className="mt-2 text-[26px] font-bold tabular-nums text-white">{insights.approvalProbability}%</p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--beast-blue)] to-emerald-400"
              style={{ width: `${insights.approvalProbability}%` }}
            />
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-white/40">Recommended Budget</p>
          <p className="mt-2 text-[20px] font-bold text-white">{insights.recommendedBudget}</p>
          <p className="mt-1 text-[12px] text-white/45">Balanced for approval odds + inventory</p>
        </div>
      </div>

      {/* Potential concerns */}
      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-white/40">Potential Concerns</p>
        <ul className="mt-2.5 space-y-2">
          {insights.concerns.map((c) => (
            <li key={c} className="flex gap-2.5 text-[13px] text-white/70">
              <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-amber-400" />
              {c}
            </li>
          ))}
        </ul>
      </div>

      {/* Suggested communities */}
      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-white/40">Suggested Communities</p>
        <div className="mt-2.5 space-y-2">
          {insights.communities.map((c) => (
            <div key={c.name} className="flex items-start justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2">
              <span className="text-[13px] font-semibold text-white">{c.name}</span>
              <span className="text-right text-[11.5px] text-white/45">{c.detail}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recommended next action */}
      <div className="mt-3 rounded-xl border border-[var(--beast-blue)]/30 bg-[var(--beast-blue)]/10 p-4">
        <p className="text-[12px] font-semibold uppercase tracking-wider text-[var(--beast-blue-bright)]">
          Recommended Next Action
        </p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/90">{insights.nextAction}</p>
      </div>
    </div>
  );
}

function SparkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2l1.6 5.9L19.5 9l-5.9 1.6L12 16.5l-1.6-5.9L4.5 9l5.9-1.5L12 2z" />
    </svg>
  );
}
