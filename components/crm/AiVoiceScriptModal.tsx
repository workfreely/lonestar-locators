"use client"

import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { formatPropertyTypeDisplay } from "@/lib/leads/propertyTypeDisplay"

type Props = {
  open: boolean
  onClose: () => void
  lead: any
  topMatches?: any[]
}

type TabId = "list_sent" | "ready_to_tour" | "tour_prep"

const TABS: { id: TabId; label: string }[] = [
  { id: "list_sent",      label: "List Sent" },
  { id: "ready_to_tour",  label: "Ready to Tour" },
  { id: "tour_prep",      label: "Tour Prep" },
]

function firstName(lead: any): string {
  const raw = (lead.first_name || "").trim()
  return raw
    ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
    : "there"
}

function buildListSent(lead: any, topMatches: any[]): string {
  const name             = firstName(lead)
  const propType         = formatPropertyTypeDisplay(lead.property_type) || "apartment"
  const topProperty      = topMatches[0]?.name || "one of the top options"
  const topPropertyReason = "it checks almost every box you mentioned"
  const wildcardProperty = topMatches[1]?.name || "a few additional options"
  const wildcardReason   = "they offer unique features that may still be a great fit"
  const keyFeatures      = "the details that matter most to you"
  const tourTimeframe    = "your preferred timeline"

  return `Morning ${name}, it's Jay!

I just sent your list over. I narrowed it down to the best ${propType} options that fit what you're looking for, and I think you're going to love what I found.

I highly recommend ${topProperty} because it checks almost every box you mentioned — ${topPropertyReason}.

I also included ${wildcardProperty} because ${wildcardReason}.

I added notes on the features of each property, including ${keyFeatures}, so you can easily compare your options.

Keep in mind that many of these communities are running specials that can significantly lower your average monthly rent.

Also, depending on the property you choose, I may be able to offer a cash rebate or free movers on top of any specials the community is currently offering.

Please let me know which ones stand out to you, and I'll help get your tours set up around ${tourTimeframe} once we have a better idea of what's available for your move date.

Talk soon!`
}

function buildReadyToTour(lead: any): string {
  const name = firstName(lead)

  return `Morning ${name}, it's Jay!

I saw the properties you liked, and I think you picked some great options.

The next step is getting your tours scheduled so you can see them in person and compare the layouts, finishes, and overall feel of each community.

Keep in mind that availability and specials can change quickly, so the sooner we get your tours scheduled, the better.

Send me your availability and I'll get everything set up. Alright, talk soon!`
}

function buildTourPrep(lead: any): string {
  const name = firstName(lead)

  return `Morning ${name}, it's Jay!

Just wanted to check in before your tours. You're going to see some great options.

I recommend taking notes and pictures of what you like and don't like. Pay attention to the layout, storage, natural light, and how the community feels.

After your tours, send me your top favorites and I'll help you compare everything and narrow down the best fit.

Also, don't forget to bring a valid photo ID for the tour. Alright, talk soon!`
}

function getScript(tab: TabId, lead: any, topMatches: any[]): string {
  if (tab === "list_sent")     return buildListSent(lead, topMatches)
  if (tab === "ready_to_tour") return buildReadyToTour(lead)
  return buildTourPrep(lead)
}

function ModalContent({ onClose, lead, topMatches = [] }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("list_sent")
  const [copied, setCopied]       = useState(false)

  const script = getScript(activeTab, lead, topMatches)

  function handleTabChange(tab: TabId) {
    setActiveTab(tab)
    setCopied(false)
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(script)
    } catch {
      const el = document.createElement("textarea")
      el.value = script
      document.body.appendChild(el)
      el.select()
      document.execCommand("copy")
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const clientName = firstName(lead)

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-6 flex flex-col"
        style={{ height: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex-none px-8 pt-5 pb-0 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d="M2 10L7 4L12 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900 leading-none">AI Voice Script</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">{clientName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? "text-blue-600 border-blue-600 bg-white"
                    : "text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Script area */}
        <div className="flex-1 overflow-y-auto px-8 py-7">
          <div className="bg-gray-50 border border-gray-100 rounded-2xl px-10 pt-8 pb-12">
            <div className="space-y-5">
              {script.split("\n\n").map((para, i) => (
                <p key={i} className="text-[15.5px] text-gray-800 leading-[2]">
                  {para}
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-none px-8 py-5 border-t border-gray-100 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="text-sm font-medium px-5 py-2.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleCopy}
            className="text-sm font-medium px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white transition-colors shadow-sm"
          >
            {copied ? "Copied!" : "Copy Script"}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AiVoiceScriptModal(props: Props) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!props.open || !mounted) return null

  return createPortal(<ModalContent {...props} />, document.body)
}
