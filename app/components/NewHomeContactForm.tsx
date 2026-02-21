
"use client";

/**
 * NewHomeContactForm
 * ------------------
 * Buyer lead capture form for new construction homes.
 * Used on city-specific Buy New Home pages.
 * Sends buyer leads to Supabase with attribution tracking.
 */

import React, { useState } from "react";
import DatePicker from "react-datepicker";
import { supabase } from "@/app/lib/supabaseClient";
import "react-datepicker/dist/react-datepicker.css";
import { useRouter } from "next/navigation";


const NewHomeContactForm = ({ defaultCity }: { defaultCity?: string }) => {

   // ==============================
  // Lead Tracking (UTM + Page Info)
 // ==============================
const isBrowser = typeof window !== "undefined";

const params = isBrowser
  ? new URLSearchParams(window.location.search)
  : null;

const pageUrl = isBrowser ? window.location.href : null;
const referrer = isBrowser ? document.referrer : null;

const utmSource = params?.get("utm_source");
const utmMedium = params?.get("utm_medium");
const utmCampaign = params?.get("utm_campaign");
const utmContent = params?.get("utm_content");

  // ======================================================
// Form State (User-Provided Data Only)
// NOTE: Do NOT add tracking fields here
// ======================================================

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    city: defaultCity || "",
    desiredPayment: "",
    moveDate: "",
    preApproved: "",
    loanType: "", // ✅ REQUIRED
    firstTimeBuyer: "", // ✅ REQUIRED
    creditScore: "",
    downPayment: "", // ✅ REQUIRED
    timeline: "", // ✅ REQUIRED
    notes: "",
    website: "", // ✅ honeypot
    sms_consent: false, // ✅ ADD
  });

  const router = useRouter();

  // ✅ Add payment ranges here
  const paymentRanges = [
    "Under $1,500",
    "$1,500 – $2,000",
    "$2,000 – $2,500",
    "$2,500 – $3,000",
    "$3,000 – $3,500",
    "$3,500 – $4,000",
    "Over $4,000",
  ];

  const loanTypes = ["FHA", "Conventional", "VA", "USDA", "Not Sure"];

  const firstTimeBuyerOptions = ["Yes", "No", "Not Sure"];

  const downPaymentRanges = [
    "Under $10,000",
    "$10,000 – $25,000",
    "$25,000 – $50,000",
    "$50,000+",
    "Not Sure",
  ];

  const timelineOptions = [
    "30–60 days",
    "2–3 months",
    "3–6 months",
    "6+ months",
  ];

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

const leadSource = utmSource ?? "direct";
  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

// ------------------------------------------------------
// Honeypot Bot Protection
// ------------------------------------------------------
    if (formData.website) {
      console.warn("Bot detected. Submission blocked.");
      return;
    }

    try {

// ======================================================
// Submit Lead to Supabase
// Includes:
// - User form data
// - Lead type/category
// - Page + UTM tracking for analytics
// ======================================================
      const { data, error } = await supabase.from("new_home_leads").insert([
        {

    // ------------------------
    // User Information
    // ------------------------
          
          
          first_name: formData.firstName,
          last_name: formData.lastName,
          email: formData.email,
          phone: formData.phone,
          city: formData.city,
          move_date: formData.moveDate || null,
          purchase_timeline: formData.timeline,
          desired_payment: formData.desiredPayment,
          pre_approved: formData.preApproved,
          loan_type: formData.loanType || null,
          first_time_buyer: formData.firstTimeBuyer,
          down_payment: formData.downPayment,
          credit_score: formData.creditScore,
          source: leadSource,

          sms_opt_in: formData.sms_consent,
          sms_consent_at: formData.sms_consent
          ? new Date().toISOString()
         : null,

// ------------------------
    // Lead Classification
    // ------------------------

          lead_category: "buyer", // ✅ ADD
          lead_type: "newhome",

          // ✅ TRACKING
          page_url: pageUrl,
          referrer: referrer,
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
          utm_content: utmContent,
 // ------------------------
    // Meta
    // ------------------------
notes: formData.notes,
website: formData.website, // honeypot

        },
      ]);

      // If your client supports it, uncomment this:
      // .select();

      if (error) {
  console.error("FULL ERROR:", JSON.stringify(error, null, 2));
  alert(
    "Yikes! There was an error submitting the form. Please try again."
  );
  return;
}

console.log("Lead submitted successfully to Supabase!", data);

if (formData.email) {
  try {
    const params = new URLSearchParams({
      firstName: formData.firstName,
      city: formData.city,
      moveDate: formData.moveDate,
      timeline: formData.timeline,
      desiredPayment: formData.desiredPayment,
      preApproved: formData.preApproved,
      loanType: formData.loanType,
      firstTimeBuyer: formData.firstTimeBuyer,
      creditScore: formData.creditScore,
      downPayment: formData.downPayment,
      notes: formData.notes || "",
    });

    const templateRes = await fetch(
      `/api/templates/buyer?${params.toString()}`
    );

    const templateHtml = await templateRes.text();

    await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: formData.email,
        subject: `${formData.city} New Update`,
        html: templateHtml,
      }),
    });
  } catch (err) {
    console.error("Lead confirmation email failed:", err);
  }
}

     router.push(
  `/new-home-thank-you?firstName=${encodeURIComponent(formData.firstName)}&city=${encodeURIComponent(formData.city)}&timeline=${encodeURIComponent(formData.timeline)}&desiredPayment=${encodeURIComponent(formData.desiredPayment)}&loanType=${encodeURIComponent(formData.loanType)}&firstTimeBuyer=${encodeURIComponent(formData.firstTimeBuyer)}&creditScore=${encodeURIComponent(formData.creditScore)}&downPayment=${encodeURIComponent(formData.downPayment)}&preApproved=${encodeURIComponent(formData.preApproved)}&notes=${encodeURIComponent(formData.notes)}`
);

    } catch (err) {
      console.error("❌ Unexpected error:", err);
      alert("Yikes! Something went wrong. Please try again.");
    }
  };

 const inputStyle: React.CSSProperties = {
    width: "100%",
    height: "46px", // ✅ Forces same height for ALL fields
    padding: "0 12px", // ✅ Horizontal padding only
    borderRadius: "6px",
    border: "1px solid #ccc",
    fontSize: "1rem",
    fontFamily: "'Inter', sans-serif",
    boxSizing: "border-box",
  };

  const sectionStyle = { marginBottom: "1rem" };

// ------------------------------------------------------
// Layout & Styling
// NOTE:
// - Layout + spacing handled inline to match ContactForm styling
// - Global input styles enforced via globals.css
// ------------------------------------------------------

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        backgroundColor: "#f9f9f9",
        padding: "1.5rem",
        borderRadius: "8px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
        fontFamily: "'Inter', sans-serif",
        minWidth: "320px",
        width: "100%",
        maxWidth: "540px",
        margin: "0 auto",
        boxSizing: "border-box",
        marginTop: "0rem",
      }}
    >
      {/* FIRST NAME */}
      <div style={sectionStyle}>
        <input
          placeholder="First Name"
          name="firstName"
          value={formData.firstName}
          onChange={handleChange}
          required
          style={inputStyle}
        />
      </div>

      {/* LAST NAME */}
      <div style={sectionStyle}>
        <input
          placeholder="Last Name"
          name="lastName"
          value={formData.lastName}
          onChange={handleChange}
          required
          style={inputStyle}
        />
      </div>

      {/* PHONE */}
<div style={sectionStyle}>
  <input
    type="tel"
    name="phone"
    placeholder="Phone Number"
    value={formData.phone}
    onChange={(e) => {
      const value = e.target.value.replace(/\D/g, "");
      const formatted =
        value.length <= 3
          ? value
          : value.length <= 6
          ? `(${value.slice(0, 3)}) ${value.slice(3)}`
          : `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6, 10)}`;

      setFormData((prev) => ({ ...prev, phone: formatted }));
    }}
    maxLength={14}
    required
    style={inputStyle}
  />
</div>

      {/* EMAIL */}
      <div style={sectionStyle}>
        <input
          placeholder="Email Address"
          type="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          required
          style={inputStyle}
        />
      </div>

      {/* CITY */}
      <div style={sectionStyle}>
        <select
          name="city"
          value={formData.city}
          onChange={handleChange}
          required
          style={inputStyle}
        >
          <option value="">Select City</option>
          <option value="Austin">Austin</option>
          <option value="Dallas">Dallas</option>
          <option value="Houston">Houston</option>
          <option value="San Antonio">San Antonio</option>
        </select>
      </div>

      {/* HOW SOON ARE YOU LOOKING TO BUY */}
      <div style={sectionStyle}>
        <select
          name="timeline"
          value={formData.timeline}
          onChange={handleChange}
          style={inputStyle}
          required
        >
          <option value="">How Soon Are You Looking to Buy?</option>
          {timelineOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      {/* PREFERRED MOVE-IN DATE */}
      <div style={sectionStyle}>
        <DatePicker
          selected={formData.moveDate ? new Date(formData.moveDate) : null}
          onChange={(date: Date | null) =>
            setFormData({
              ...formData,
              moveDate: date ? date.toISOString().split("T")[0] : "",
            })
          }
          placeholderText="Preferred Move-In Date"
          dateFormat="MM/dd/yyyy"
          className="form-input"
        />
      </div>

      {/* PRE-APPROVED */}
      <div style={sectionStyle}>
        <select
          name="preApproved"
          value={formData.preApproved}
          onChange={handleChange}
          style={inputStyle}
          required
        >
          <option value="">Are You Pre-Approved?</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
          <option value="Not Sure">Not Sure</option>
        </select>
      </div>

      {/* LOAN TYPE — CONDITIONAL */}
      {formData.preApproved === "Yes" && (
        <div style={sectionStyle}>
          <select
            name="loanType"
            value={formData.loanType}
            onChange={handleChange}
            style={inputStyle}
            required
          >
            <option value="">Select Loan Type</option>
            {loanTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* DESIRED MONTHLY PAYMENT */}
      <div style={sectionStyle}>
        <select
          name="desiredPayment"
          value={formData.desiredPayment}
          onChange={handleChange}
          style={inputStyle}
          required
        >
          <option value="">Select Desired Monthly Payment</option>
          {paymentRanges.map((range) => (
            <option key={range} value={range}>
              {range}
            </option>
          ))}
        </select>
      </div>

      {/* FIRST-TIME BUYER */}
      <div style={sectionStyle}>
        <select
          name="firstTimeBuyer"
          value={formData.firstTimeBuyer}
          onChange={handleChange}
          style={inputStyle}
          required
        >
          <option value="">First-Time Homebuyer?</option>
          {firstTimeBuyerOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>

      {/* CREDIT SCORE */}
      <div style={sectionStyle}>
        <select
          name="creditScore"
          value={formData.creditScore}
          onChange={handleChange}
          style={inputStyle}
          required
        >
          <option value="">Estimated Credit Score</option>
          <option value="580 or below">580 or below</option>
          <option value="581 - 619">581 - 619</option>
          <option value="620 - 659">620 - 659</option>
          <option value="660 - 699">660 - 699</option>
          <option value="700 - 749">700 - 749</option>
          <option value="750 or above">750 or above</option>
        </select>
      </div>

      {/* DOWN PAYMENT */}
      <div style={sectionStyle}>
        <select
          name="downPayment"
          value={formData.downPayment}
          onChange={handleChange}
          style={inputStyle}
          required
        >
          <option value="">Estimated Down Payment Available</option>
          {downPaymentRanges.map((range) => (
            <option key={range} value={range}>
              {range}
            </option>
          ))}
        </select>
      </div>

      {/* MESSAGE */}
      <div style={sectionStyle}>
        <textarea
  name="notes"
  placeholder="Any additional notes or preferences?"
  value={formData.notes}
  onChange={handleChange}
  rows={4}
  style={{
  ...inputStyle,
  height: "auto",     // ✅ override fixed height
  padding: "12px",    // ✅ restore vertical padding for textarea
}}
/>
      </div>

      {/* Honeypot */}
      <input
        type="text"
        name="website"
        value={formData.website}
        onChange={handleChange}
        style={{ display: "none" }}
        tabIndex={-1}
        autoComplete="off"
      />

{/* SMS & Email Consent */}
<div
  style={{
    display: "flex",
    gap: "0.5rem",
    alignItems: "flex-start",
    marginTop: "1rem",
    fontSize: "0.85rem",
    color: "#444",
  }}
>
  <input
    type="checkbox"
    id="smsConsent"
    checked={formData.sms_consent}
    onChange={(e) =>
      setFormData((prev) => ({
        ...prev,
        sms_consent: e.target.checked,
      }))
    }
    required
    style={{ marginTop: "2px" }}
  />
  <label htmlFor="smsConsent">
    I agree to receive texts & emails about my search and opt-out anytime.
  </label>
</div>

      {/* SUBMIT */}
      <button
        type="submit"
        style={{
          backgroundColor: "#1a7f37",
          color: "#fff",
          padding: "0.75rem",
          borderRadius: "6px",
          border: "none",
          width: "100%",
          fontSize: "1rem",
          cursor: "pointer",
          marginTop: "1rem",
        }}
      >
        Buy My New Home
      </button>
    </form>
  );
};

export default NewHomeContactForm;

