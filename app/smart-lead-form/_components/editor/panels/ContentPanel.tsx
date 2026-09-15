import type { SmartLeadFormConfig, TestimonialItem, FaqItem } from "../../../_lib/types"
import { TextField } from "../ui/TextField"
import ToggleRow from "../ui/ToggleRow"
import Card from "../ui/Card"
import UploadTile from "../ui/UploadTile"
import ConsentPanel from "./ConsentPanel"

type Updater = (updater: (prev: SmartLeadFormConfig) => SmartLeadFormConfig) => void

export default function ContentPanel({
  config,
  onChange,
  licenseState,
}: {
  config: SmartLeadFormConfig
  onChange: Updater
  /** profiles.license_state. The TREC fields below are Texas law, so they are
   *  offered ONLY to Texas agents — showing them to a Florida agent implied a
   *  disclosure obligation that does not apply to them. */
  licenseState?: string | null
}) {
  const isTexas = (licenseState ?? "").toUpperCase() === "TX"
  const copy = config.copy
  const footer = config.footer
  const visibility = config.sections.visibility

  function updateCopy(patch: Partial<SmartLeadFormConfig["copy"]>) {
    onChange((prev) => ({ ...prev, copy: { ...prev.copy, ...patch } }))
  }

  function updateHighlight(index: 0 | 1 | 2, value: string) {
    onChange((prev) => {
      const highlights = [...prev.copy.highlights] as [string, string, string]
      highlights[index] = value
      return { ...prev, copy: { ...prev.copy, highlights } }
    })
  }

  function updateTestimonial(index: 0 | 1 | 2, patch: Partial<TestimonialItem>) {
    onChange((prev) => {
      const testimonials = [...prev.copy.testimonials] as [TestimonialItem, TestimonialItem, TestimonialItem]
      testimonials[index] = { ...testimonials[index], ...patch }
      return { ...prev, copy: { ...prev.copy, testimonials } }
    })
  }

  function updateFaq(index: 0 | 1 | 2, patch: Partial<FaqItem>) {
    onChange((prev) => {
      const faqs = [...prev.copy.faqs] as [FaqItem, FaqItem, FaqItem]
      faqs[index] = { ...faqs[index], ...patch }
      return { ...prev, copy: { ...prev.copy, faqs } }
    })
  }

  function updateFooter(patch: Partial<SmartLeadFormConfig["footer"]>) {
    onChange((prev) => ({ ...prev, footer: { ...prev.footer, ...patch } }))
  }

  function updateVisibility(patch: Partial<SmartLeadFormConfig["sections"]["visibility"]>) {
    onChange((prev) => ({
      ...prev,
      sections: { ...prev.sections, visibility: { ...prev.sections.visibility, ...patch } },
    }))
  }

  // Additional Legal & Disclosure Links — reusable custom rows (title + url),
  // persisted in the JSON config alongside the Texas presets.
  function addDisclosure() {
    onChange((prev) => ({
      ...prev,
      footer: { ...prev.footer, customDisclosures: [...(prev.footer.customDisclosures ?? []), { title: "", url: "" }] },
    }))
  }
  function updateDisclosure(index: number, patch: Partial<{ title: string; url: string }>) {
    onChange((prev) => {
      const rows = [...(prev.footer.customDisclosures ?? [])]
      rows[index] = { ...rows[index], ...patch }
      return { ...prev, footer: { ...prev.footer, customDisclosures: rows } }
    })
  }
  function removeDisclosure(index: number) {
    onChange((prev) => ({
      ...prev,
      footer: {
        ...prev.footer,
        customDisclosures: (prev.footer.customDisclosures ?? []).filter((_, i) => i !== index),
      },
    }))
  }

  return (
    <div className="flex flex-col divide-y divide-[#f0f1f5]">
      {/* Hero is FIRST here because it is first on the public page — this list's
          order mirrors SmartLeadForm's render order exactly (Hero → form →
          Testimonials → FAQs → footer) and is fixed. */}
      <div className="pt-3">
        <p className="pb-1 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">Hero</p>

        <ToggleRow strong label="Headline" checked={visibility.headline} onChange={(v) => updateVisibility({ headline: v })} />
        <TextField label="Headline" value={copy.headline} onChange={(v) => updateCopy({ headline: v })} multiline maxLength={45} />
        <TextField
          label="Subheadline"
          value={copy.subheadline}
          onChange={(v) => updateCopy({ subheadline: v })}
          multiline
          maxLength={110}
        />
        <TextField label="Button Text" value={copy.buttonText} onChange={(v) => updateCopy({ buttonText: v })} />

        <div className="pt-3">
          <ToggleRow strong label="Highlights" checked={visibility.highlights} onChange={(v) => updateVisibility({ highlights: v })} />
          <TextField label="Highlight 1" value={copy.highlights[0]} onChange={(v) => updateHighlight(0, v)} />
          <TextField label="Highlight 2" value={copy.highlights[1]} onChange={(v) => updateHighlight(1, v)} />
          <TextField label="Highlight 3" value={copy.highlights[2]} onChange={(v) => updateHighlight(2, v)} />
        </div>

        <div className="pt-3">
          <ToggleRow strong label="Agent Information" checked={visibility.agentProfile} onChange={(v) => updateVisibility({ agentProfile: v })} />
          <TextField label="Agent Name" value={copy.agentName} onChange={(v) => updateCopy({ agentName: v })} />
          <TextField label="Agent Title" value={copy.agentTitle} onChange={(v) => updateCopy({ agentTitle: v })} />
          <ToggleRow label="Show brokerage info" checked={visibility.brokerageInfo} onChange={(v) => updateVisibility({ brokerageInfo: v })} />
          {visibility.brokerageInfo && (
            <TextField label="Brokerage Name" value={copy.brokerageName} onChange={(v) => updateCopy({ brokerageName: v })} />
          )}
          <ToggleRow label="Show service areas" checked={visibility.serviceAreas} onChange={(v) => updateVisibility({ serviceAreas: v })} />
          {visibility.serviceAreas && (
            <TextField label="Service Areas" value={copy.serviceAreas} onChange={(v) => updateCopy({ serviceAreas: v })} />
          )}
          <ToggleRow label="Show phone number" checked={visibility.phoneNumber} onChange={(v) => updateVisibility({ phoneNumber: v })} />
          {visibility.phoneNumber && (
            <TextField label="Phone Number" value={copy.phoneNumber} onChange={(v) => updateCopy({ phoneNumber: v })} />
          )}
        </div>
      </div>

      {/* ── Smart Lead Form (always shown; fields live in the Fields tab) ────── */}
      <div className="pt-3">
        <div className="flex items-center justify-between py-2.5">
          <p className="text-[13px] font-semibold text-[#111318]">Smart Lead Form</p>
          <span className="text-[11px] font-medium text-[#9098a8]">Always shown</span>
        </div>
        <p className="pb-1 text-[11.5px] leading-relaxed text-[#9098a8]">
          Fields are set in the Fields tab.
        </p>
      </div>


      {/* ── Testimonials (optional) ─────────────────────────────────────────── */}
      <div className="pt-3">
        <ToggleRow strong label="Testimonials" checked={visibility.testimonials} onChange={(v) => updateVisibility({ testimonials: v })} />
        <div className="flex flex-col gap-3 pb-1 pt-1">
          {copy.testimonials.map((t, i) => (
            <Card key={i}>
              <p className="pb-1 text-[12px] font-semibold text-[#4b5162]">Testimonial {i + 1}</p>
              <div className="flex gap-3">
                <UploadTile
                  label="Photo (optional)"
                  imageUrl={t.photoUrl}
                  onChange={(url) => updateTestimonial(i as 0 | 1 | 2, { photoUrl: url })}
                  round
                />
                <div className="flex-1">
                  <TextField label="Customer Name" value={t.name} onChange={(v) => updateTestimonial(i as 0 | 1 | 2, { name: v })} />
                  <TextField label="City (optional)" value={t.city} onChange={(v) => updateTestimonial(i as 0 | 1 | 2, { city: v })} />
                </div>
              </div>
              <TextField label="Review" value={t.quote} onChange={(v) => updateTestimonial(i as 0 | 1 | 2, { quote: v })} multiline />
            </Card>
          ))}
        </div>
      </div>

      {/* ── FAQs (optional) — always after Testimonials ─────────────────────── */}
      <div className="pt-3">
        <ToggleRow strong label="FAQs" checked={visibility.faq} onChange={(v) => updateVisibility({ faq: v })} />
        <div className="flex flex-col gap-3 pb-1 pt-1">
          {copy.faqs.map((item, i) => (
            <Card key={i}>
              <p className="pb-1 text-[12px] font-semibold text-[#4b5162]">FAQ {i + 1}</p>
              <TextField label="Question" value={item.question} onChange={(v) => updateFaq(i as 0 | 1 | 2, { question: v })} />
              <TextField label="Answer" value={item.answer} onChange={(v) => updateFaq(i as 0 | 1 | 2, { answer: v })} multiline />
            </Card>
          ))}
        </div>
      </div>

      {/* ── Consent ─────────────────────────────────────────────────────────
          Sits with the legal copy at the bottom rather than in public-render
          order (the checkbox itself renders inside the form, above the submit
          button). Grouping it next to Legal & Disclosures keeps every piece of
          compliance wording an agent can edit in one place. */}
      <div className="pt-3">
        <ConsentPanel config={config} onChange={onChange} />
      </div>

      {/* ── Legal & Disclosures ─────────────────────────────────────────────── */}
      <div className="pt-3">
        <p className="pb-1 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">Legal &amp; Disclosures</p>
        <p className="pb-2 text-[12px] leading-relaxed text-[#9098a8]">
          Shown in your form footer. Privacy Policy, Terms of Service, and &ldquo;Powered by Locator
          Beast&rdquo; always appear.
        </p>

        {/* Texas TREC disclosure presets — TEXAS AGENTS ONLY. Enter the document URL
            to display each in the footer; leaving a field blank shows nothing.
            Hidden entirely outside Texas: these are Texas statutory requirements and
            no other state's equivalents are implemented. URLs a Texas agent already
            saved stay in the config untouched. */}
        {isTexas && (
          <>
            <TextField
              label="Texas Real Estate Commission Information About Brokerage Services"
              value={footer.iabsUrl}
              onChange={(v) => updateFooter({ iabsUrl: v })}
            />
            <TextField
              label="Texas Real Estate Commission Consumer Protection Notice"
              value={footer.consumerProtectionNoticeUrl}
              onChange={(v) => updateFooter({ consumerProtectionNoticeUrl: v })}
            />
          </>
        )}

        {/* Additional Legal & Disclosure Links — reusable rows (title + url). */}
        <div className="pt-4">
          <p className="pb-0.5 text-[12.5px] font-semibold text-[#4b5162]">Additional Legal &amp; Disclosure Links</p>
          <p className="pb-2 text-[12px] leading-relaxed text-[#9098a8]">
            Link Title becomes the footer link text.
          </p>
          {footer.customDisclosures.map((row, i) => (
            <div key={i} className="mb-2 rounded-lg border border-[#e5e7ee] p-3">
              <TextField label="Link Title" value={row.title} onChange={(v) => updateDisclosure(i, { title: v })} />
              <TextField label="URL" value={row.url} onChange={(v) => updateDisclosure(i, { url: v })} />
              <button
                type="button"
                onClick={() => removeDisclosure(i)}
                className="mt-1 text-[12px] font-semibold text-red-600 transition-colors hover:text-red-700"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addDisclosure}
            className="mt-1 text-[13px] font-semibold text-[#2f6bff] transition-colors hover:text-[#265fe0]"
          >
            + Add disclosure
          </button>
        </div>
      </div>
    </div>
  )
}
