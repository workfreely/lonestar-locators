import type { LeadSummaryDTO, NextActionDTO } from "@bc/companion-shared";

/**
 * SANITIZED demo fixtures — Phase 3 only. Obviously-fake names and reserved
 * 555-01xx "fictional" phone numbers. NEVER real client data. These exist purely
 * to render the panel's visual states in the dev harness; the production build
 * never loads them (see main.tsx). Nothing here is persisted.
 */

export interface DemoFixture {
  key: string;
  label: string;
  lead: LeadSummaryDTO;
  nextActions: NextActionDTO[];
}

export const DEMO_FIXTURES: DemoFixture[] = [
  {
    key: "contacted",
    label: "Contacted · mid-workflow",
    lead: {
      id: "demo-contacted",
      firstName: "Jordan",
      lastName: "Sample",
      phone: "(555) 010-4477",
      stage: "contacted",
      isArchived: false,
      isClosed: false,
      searchCriteria: {
        city: "Sampleton",
        budgetText: "$1,200 – $1,800",
        income: "$4,000 – $6,000 / month", // canonical SmartLead Form option
        propertyType: "Apartment",
        beds: "1-2",
        baths: "1-2",
        moveDate: "2026-09-01",
        desiredAreas: "Demo Heights",
        source: "demo",
      },
      creditScreening: {
        creditScore: "700+",
        creditHistory: "Good",
        criminalBackground: "None",
      },
      workflow: {
        followUpCount: 1,
        nextActionDate: "2026-08-08T14:00:00.000Z",
        firstContactAt: "2026-08-06T15:30:00.000Z",
      },
      clientNotes:
        "Moving for a new job downtown. Prefers a quiet building with in-unit laundry, and has a small dog. Flexible on move date by a couple weeks. (demo)",
    },
    nextActions: [
      {
        id: "demo-act-1",
        leadId: "demo-contacted",
        title: "Follow Up",
        dueAt: "2026-08-08T14:00:00.000Z",
        priority: "medium",
        completed: false,
      },
    ],
  },
  {
    key: "list_sent",
    label: "List Sent · guest cards",
    lead: {
      id: "demo-listsent",
      firstName: "Riley",
      lastName: "Placeholder",
      phone: "(555) 010-8830",
      stage: "list_sent",
      isArchived: false,
      isClosed: false,
      searchCriteria: {
        city: "Sampleton",
        budgetText: "$2,000 – $2,600",
        income: "$6,000 – $8,000 / month", // canonical SmartLead Form option
        propertyType: "High-Rise",
        beds: "2",
        baths: "2",
        moveDate: "2026-10-15",
        desiredAreas: "Demo Downtown",
        source: "demo",
      },
      creditScreening: {
        creditScore: "640",
        creditHistory: "Broken Lease",
        brokenLeaseAge: "2 yrs",
        criminalBackground: "None",
      },
      workflow: {
        followUpCount: 0,
        nextActionDate: "2026-08-07T14:00:00.000Z",
        firstContactAt: "2026-08-05T18:00:00.000Z",
      },
      clientNotes: "Wants a 2-bed high-rise near downtown with a gym. Budget is firm. (demo)",
    },
    nextActions: [
      {
        // Identity stays the internal FU title; the UI renders "Follow-Up 1".
        id: "demo-act-2",
        leadId: "demo-listsent",
        title: "FU1",
        dueAt: "2026-08-07T14:00:00.000Z",
        priority: "high",
        completed: false,
      },
    ],
  },
  {
    key: "closed",
    label: "Closed · invoice section",
    lead: {
      id: "demo-closed",
      firstName: "Alex",
      lastName: "Demo",
      phone: "(555) 010-2299",
      stage: "closed",
      isArchived: false,
      isClosed: true,
      searchCriteria: {
        city: "Sampleton",
        budgetText: "$1,500",
        propertyType: "Apartment",
        beds: "1",
        baths: "1",
        moveDate: "2026-07-01",
        desiredAreas: "Demo Midtown",
        source: "demo",
      },
      creditScreening: {
        creditScore: "720",
        creditHistory: "Good",
        criminalBackground: "None",
      },
      workflow: {
        followUpCount: 0,
        nextActionDate: "2026-08-06T14:00:00.000Z",
        firstContactAt: "2026-06-20T16:00:00.000Z",
      },
      clientNotes: "", // empty → shows the "No notes submitted." placeholder
    },
    nextActions: [
      {
        // Legacy identity "Invoice Details"; the UI renders "Get Invoice Details".
        id: "demo-act-3",
        leadId: "demo-closed",
        title: "Invoice Details",
        dueAt: "2026-08-06T14:00:00.000Z",
        priority: "medium",
        completed: false,
      },
    ],
  },
];

export const DEFAULT_FIXTURE_KEY = DEMO_FIXTURES[0].key;
