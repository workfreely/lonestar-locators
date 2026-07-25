import type { ConditionalRule, FieldConfig } from "./types"

// Always shown, in this order. Real-world field/autoComplete choices
// (name/tel/email split, not one combined "contact" blob) so browser
// autofill works the way it does on the proven production form.
export const BASE_FIELDS: FieldConfig[] = [
  { id: "firstName", label: "First Name", type: "text", autoComplete: "given-name" },
  { id: "lastName", label: "Last Name", type: "text", autoComplete: "family-name" },
  { id: "phone", label: "Phone Number", type: "tel", autoComplete: "tel" },
  { id: "email", label: "Email", type: "email", autoComplete: "email" },
  { id: "moveDate", label: "Desired Move-In Date", type: "date" },
  {
    id: "hasPets",
    label: "Do you have pets?",
    type: "select",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },
  {
    id: "employmentType",
    label: "Employment Type",
    type: "select",
    options: [
      { value: "employed", label: "Employed" },
      { value: "self-employed", label: "Self-Employed" },
      { value: "student", label: "Student" },
    ],
  },
]

// Placeholder demo of two conditional patterns: a simple yes/no reveal
// (pets), and a multi-branch reveal where the follow-up question changes
// based on which option was picked (employment type). This is the same
// shape the real qualification logic will use later — only the questions
// themselves are placeholders.
export const CONDITIONAL_RULES: ConditionalRule[] = [
  {
    when: (v) => v.hasPets === "yes",
    fields: [
      { id: "petType", label: "What type of pet?", type: "text", placeholder: "e.g. Dog, Cat" },
      {
        id: "petWeight",
        label: "Approximate weight",
        type: "select",
        options: [
          { value: "under-25", label: "Under 25 lbs" },
          { value: "25-50", label: "25–50 lbs" },
          { value: "50+", label: "50+ lbs" },
        ],
      },
    ],
  },
  {
    when: (v) => v.employmentType === "employed",
    fields: [{ id: "employerName", label: "Employer Name", type: "text" }],
  },
  {
    when: (v) => v.employmentType === "self-employed",
    fields: [{ id: "businessName", label: "Business Name", type: "text" }],
  },
  {
    when: (v) => v.employmentType === "student",
    fields: [{ id: "schoolName", label: "School Name", type: "text" }],
  },
]
