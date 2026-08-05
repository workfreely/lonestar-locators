"use client";

import { useState } from "react";
import {
  SAMPLE_LEAD,
  BUDGET_OPTIONS,
  BEDROOM_OPTIONS,
  AREA_OPTIONS,
  type DemoLead,
} from "@/app/locator-beast/(site)/demo/_data/demo";

const fieldCls =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-white placeholder-white/30 outline-none transition-colors focus:border-[var(--beast-blue)]";
const labelCls = "text-[12.5px] font-medium text-white/60";

// A simplified, sample-data version of the Smart Lead Form — only the core
// fields, so visitors grasp "I can build my own branded lead form" without
// seeing every production field or configuration option.
export default function DemoSmartLeadForm({ onSubmit }: { onSubmit: (lead: DemoLead) => void }) {
  const [lead, setLead] = useState<DemoLead>(SAMPLE_LEAD);
  const set = (k: keyof DemoLead) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setLead((prev) => ({ ...prev, [k]: e.target.value }));

  return (
    <div className="mx-auto w-full max-w-xl rounded-2xl border border-white/10 bg-[#0b0f1a] p-6 sm:p-8">
      <div className="text-center">
        <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-[var(--beast-blue-bright)]">
          Your Branded Lead Form
        </p>
        <h3 className="mt-2 text-[20px] font-semibold text-white">Tell us about your move</h3>
        <p className="mt-1.5 text-[13.5px] text-white/55">
          This is a live sample — edit anything, then submit to see what happens next.
        </p>
      </div>

      <form
        className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(lead);
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Name</span>
          <input className={fieldCls} value={lead.name} onChange={set("name")} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Phone</span>
          <input className={fieldCls} inputMode="tel" value={lead.phone} onChange={set("phone")} />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelCls}>Email</span>
          <input className={fieldCls} inputMode="email" value={lead.email} onChange={set("email")} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Budget</span>
          <select className={fieldCls} value={lead.budget} onChange={set("budget")}>
            {BUDGET_OPTIONS.map((o) => (
              <option key={o} className="bg-[#0b0f1a]">{o}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Bedrooms</span>
          <select className={fieldCls} value={lead.bedrooms} onChange={set("bedrooms")}>
            {BEDROOM_OPTIONS.map((o) => (
              <option key={o} className="bg-[#0b0f1a]">{o}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Move Date</span>
          <input type="date" className={fieldCls} value={lead.moveDate} onChange={set("moveDate")} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Preferred Area</span>
          <select className={fieldCls} value={lead.area} onChange={set("area")}>
            {AREA_OPTIONS.map((o) => (
              <option key={o} className="bg-[#0b0f1a]">{o}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelCls}>Notes</span>
          <textarea rows={3} className={`${fieldCls} resize-none`} value={lead.notes} onChange={set("notes")} />
        </label>

        <button
          type="submit"
          className="sm:col-span-2 mt-1 w-full rounded-full bg-[var(--beast-blue)] px-6 py-3 text-[14.5px] font-semibold text-white transition-transform duration-200 hover:scale-[1.01]"
        >
          Submit
        </button>
      </form>
    </div>
  );
}
