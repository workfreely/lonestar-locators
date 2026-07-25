import type { SmartLeadFormConfig, TestimonialItem, FaqItem } from "../../../_lib/types"
import { TextField } from "../ui/TextField"
import Toggle from "../ui/Toggle"
import UploadTile from "../ui/UploadTile"

type Updater = (updater: (prev: SmartLeadFormConfig) => SmartLeadFormConfig) => void

export default function ContentPanel({ config, onChange }: { config: SmartLeadFormConfig; onChange: Updater }) {
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

  return (
    <div className="flex flex-col divide-y divide-[#f0f1f5]">
      <div>
        <p className="pb-1 pt-1 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">Headline</p>
        <TextField label="Headline" value={copy.headline} onChange={(v) => updateCopy({ headline: v })} multiline maxLength={45} />
        <TextField
          label="Subheadline"
          value={copy.subheadline}
          onChange={(v) => updateCopy({ subheadline: v })}
          multiline
          maxLength={110}
        />
        <TextField label="Button Text" value={copy.buttonText} onChange={(v) => updateCopy({ buttonText: v })} />
      </div>

      <div className="pt-3">
        <p className="pb-1 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">Agent Information</p>
        <TextField label="Agent Name" value={copy.agentName} onChange={(v) => updateCopy({ agentName: v })} />
        <TextField label="Agent Title" value={copy.agentTitle} onChange={(v) => updateCopy({ agentTitle: v })} />
        <Toggle label="Show brokerage info" checked={visibility.brokerageInfo} onChange={(v) => updateVisibility({ brokerageInfo: v })} />
        {visibility.brokerageInfo && (
          <TextField label="Brokerage Name" value={copy.brokerageName} onChange={(v) => updateCopy({ brokerageName: v })} />
        )}
        <Toggle label="Show service areas" checked={visibility.serviceAreas} onChange={(v) => updateVisibility({ serviceAreas: v })} />
        {visibility.serviceAreas && (
          <TextField label="Service Areas" value={copy.serviceAreas} onChange={(v) => updateCopy({ serviceAreas: v })} />
        )}
        <Toggle label="Show phone number" checked={visibility.phoneNumber} onChange={(v) => updateVisibility({ phoneNumber: v })} />
        {visibility.phoneNumber && (
          <TextField label="Phone Number" value={copy.phoneNumber} onChange={(v) => updateCopy({ phoneNumber: v })} />
        )}
      </div>

      <div className="pt-3">
        <p className="pb-1 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">Highlights</p>
        <TextField label="Highlight 1" value={copy.highlights[0]} onChange={(v) => updateHighlight(0, v)} />
        <TextField label="Highlight 2" value={copy.highlights[1]} onChange={(v) => updateHighlight(1, v)} />
        <TextField label="Highlight 3" value={copy.highlights[2]} onChange={(v) => updateHighlight(2, v)} />
      </div>

      <div className="pt-3">
        <p className="pb-1 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">Testimonials</p>
        <div className="flex flex-col gap-3 pb-2">
          {copy.testimonials.map((t, i) => (
            <div key={i} className="rounded-xl border border-[#e5e7ee] p-3">
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
            </div>
          ))}
        </div>
      </div>

      <div className="pt-3">
        <p className="pb-1 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">FAQs</p>
        <div className="flex flex-col gap-3 pb-2">
          {copy.faqs.map((item, i) => (
            <div key={i} className="rounded-xl border border-[#e5e7ee] p-3">
              <p className="pb-1 text-[12px] font-semibold text-[#4b5162]">FAQ {i + 1}</p>
              <TextField label="Question" value={item.question} onChange={(v) => updateFaq(i as 0 | 1 | 2, { question: v })} />
              <TextField label="Answer" value={item.answer} onChange={(v) => updateFaq(i as 0 | 1 | 2, { answer: v })} multiline />
            </div>
          ))}
        </div>
      </div>

      <div className="pt-3">
        <p className="pb-1 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">Footer</p>
        <p className="pb-2 text-[12px] leading-relaxed text-[#9098a8]">
          Privacy Policy, Terms of Service, and &ldquo;Powered by Locator Beast&rdquo; always appear and aren&apos;t editable.
        </p>

        <Toggle
          label="Show brokerage website"
          checked={visibility.footerBrokerageWebsite}
          onChange={(v) => updateVisibility({ footerBrokerageWebsite: v })}
        />
        {visibility.footerBrokerageWebsite && (
          <TextField label="Brokerage Website URL" value={footer.brokerageWebsiteUrl} onChange={(v) => updateFooter({ brokerageWebsiteUrl: v })} />
        )}

        <Toggle
          label="Show office phone"
          checked={visibility.footerOfficePhone}
          onChange={(v) => updateVisibility({ footerOfficePhone: v })}
        />
        {visibility.footerOfficePhone && (
          <TextField label="Office Phone" value={footer.officePhone} onChange={(v) => updateFooter({ officePhone: v })} />
        )}

        <Toggle label="Show IABS (Texas)" checked={visibility.footerIabs} onChange={(v) => updateVisibility({ footerIabs: v })} />
        {visibility.footerIabs && (
          <TextField label="IABS Document URL" value={footer.iabsUrl} onChange={(v) => updateFooter({ iabsUrl: v })} />
        )}

        <Toggle
          label="Show Consumer Protection Notice (Texas)"
          checked={visibility.footerConsumerProtectionNotice}
          onChange={(v) => updateVisibility({ footerConsumerProtectionNotice: v })}
        />
        {visibility.footerConsumerProtectionNotice && (
          <TextField
            label="Consumer Protection Notice URL"
            value={footer.consumerProtectionNoticeUrl}
            onChange={(v) => updateFooter({ consumerProtectionNoticeUrl: v })}
          />
        )}
      </div>
    </div>
  )
}
