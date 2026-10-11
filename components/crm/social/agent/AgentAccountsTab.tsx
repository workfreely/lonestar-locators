"use client"

// ACCOUNTS — the agent's own connected destinations.
//
// STAGE 3 IS READ-ONLY, and this tab is the clearest case for that: every control on it is
// consequential. Connect grants a third party posting rights, Disconnect revokes a live token,
// Start begins publishing to a real audience. None of them should exist as a half-wired button,
// so they are rendered disabled until their routes exist and have been tested.
export default function AgentAccountsTab() {
  return (
    <div className="flex flex-col gap-3">
      <AccountRow
        platform="Instagram"
        note="Connect your Instagram Business account to receive approved property videos."
      />
      <AccountRow
        platform="TikTok"
        note="TikTok posting requires confirming privacy, disclosure and music settings for each post."
      />
      <p className="px-1 text-[11.5px] text-[var(--crm-text-muted)]">
        Connecting, disconnecting and start/pause controls arrive in the next release. Posting is
        paused for every account until then.
      </p>
    </div>
  )
}

function AccountRow({ platform, note }: { platform: string; note: string }) {
  return (
    <div className="rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[13.5px] font-medium">{platform}</h3>
          <p className="mt-0.5 text-[12px] text-[var(--crm-text-muted)]">Not connected</p>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled title="Available in the next release"
            className="rounded-md border border-[var(--crm-border)] px-3 py-1.5 text-[12px] opacity-40">
            Connect
          </button>
          <button type="button" disabled title="Available in the next release"
            className="rounded-md border border-[var(--crm-border)] px-3 py-1.5 text-[12px] opacity-40">
            Pause
          </button>
        </div>
      </div>
      <p className="mt-2 text-[11.5px] text-[var(--crm-text-muted)]">{note}</p>
    </div>
  )
}
