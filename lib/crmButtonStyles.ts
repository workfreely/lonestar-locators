// Shared header button styles — same border radius, height, padding,
// typography, and hover/focus treatment for every primary/secondary
// button in the CRM's application shell (main header, Performance
// header), so "Performance" and "← Back to Dashboard" visually
// coordinate with "+ Add Lead" without competing with it.

export const CRM_PRIMARY_BUTTON =
  "inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"

export const CRM_SECONDARY_BUTTON =
  "inline-flex items-center gap-1.5 border border-[var(--crm-border)] bg-[var(--crm-panel)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] hover:text-[var(--crm-text-primary)] text-sm font-medium px-4 py-1.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1"
