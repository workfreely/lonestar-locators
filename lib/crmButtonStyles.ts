// Shared header button styles — same border radius, height, padding,
// typography, and hover/focus treatment for every primary/secondary
// button in the CRM's application shell (main header, Performance
// header), so "Performance" and "← Back to Dashboard" visually
// coordinate with "+ Add Lead" without competing with it.

export const CRM_PRIMARY_BUTTON =
  "crm-cta inline-flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg shadow-sm"

export const CRM_SECONDARY_BUTTON =
  "inline-flex items-center gap-2 border border-[var(--crm-border)] bg-[var(--crm-panel)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] hover:text-[var(--crm-text-primary)] text-sm font-medium px-5 py-2.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
