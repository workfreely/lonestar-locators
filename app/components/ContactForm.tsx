/**
 * ContactForm
 * -----------
 * Primary renter lead capture form.
 * Supports short + full modes.
 * Sends leads to Supabase with UTM + page tracking.
 */

"use client";

import React, { useState, useEffect } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { format } from "date-fns";
import { supabase } from "@/app/lib/supabaseClient";
import { useRouter, useSearchParams } from "next/navigation";

interface ContactFormProps {
  mode?: "short" | "full";
  propertyName?: string;
}

const ContactForm: React.FC<ContactFormProps> = ({
  mode = "full",
  propertyName,
}) => {
  const isShortForm = mode === "short";
  const router = useRouter();
  const searchParams = useSearchParams();

// ======================================================
// Lead Tracking (Page URL, Referrer, UTM Parameters)
// Purpose: Attribution + analytics (Google, Meta, CRM)
// ======================================================

const pageUrl =
  typeof window !== "undefined" ? window.location.href : null;

const referrer =
  typeof document !== "undefined" ? document.referrer : null;

const utmSource = searchParams.get("utm_source");
const utmMedium = searchParams.get("utm_medium");
const utmCampaign = searchParams.get("utm_campaign");
const utmContent = searchParams.get("utm_content");

// ======================================================
// Form State (User-Provided Data Only)
// NOTE: Do NOT add tracking fields here
// ======================================================

const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
  // ==========================
  // USER INPUT
  // ==========================
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  moveDate: "",
  city: "",
  neighborhoods: [] as string[],
  submarkets: [] as string[],
  propertyType: "",
  desiredRent: "",
  beds: "",
  baths: "",
  income: "",

  // ==========================
  // CREDIT / SCREENING
  // ==========================
  creditHistory: "",
creditScore: "",
brokenLeaseAge: "",
brokenLeaseAmount: "",
evictionCourt: "",
evictionAge: "",
evictionBalance: "",

criminalBackground: "",
criminalCharge: "",

felonyAge: "",
misdemeanorAge: "",

  // ==========================
  // NOTES / META
  // ==========================
  notes: "",
  website: "",

  // ==========================
  // CONSENT
  // ==========================
  sms_consent: false,

  // ==========================
  // TRACKING (NOT USER INPUT)
  // ==========================
  page_url: pageUrl,
  referrer: referrer,
  utm_source: utmSource,
  utm_medium: utmMedium,
  utm_campaign: utmCampaign,
  utm_content: utmContent,
});

useEffect(() => {
  const emailFromUrl = searchParams.get("email");
  const firstName = searchParams.get("firstName");
  const lastName = searchParams.get("lastName");
  const phone = searchParams.get("phone");
  const moveDate = searchParams.get("moveDate");
  const city = searchParams.get("city");
  const propertyName = searchParams.get("propertyName");

  setFormData((prev) => ({
    ...prev,
    email: emailFromUrl || prev.email,
    firstName: firstName || prev.firstName,
    lastName: lastName || prev.lastName,
    phone: phone || prev.phone,
    moveDate: moveDate || prev.moveDate,
    city: city || prev.city,
    notes: propertyName
      ? `Listing: ${propertyName}${prev.notes ? ` | ${prev.notes}` : ""}`
      : prev.notes,
  }));
}, [searchParams]);

  const cityNeighborhoods: Record<string, string[]> = {
    Austin: [
      "All of Austin",
      "Downtown Austin",
      "South Congress (SoCo)",
      "East Austin",
      "Zilker",
      "Mueller",
      "Domain",
      "Barton Creek",
      "Westlake",
      "Riverside",
      "North Loop",
      "South Lamar", // ✅ new
    ],
    Dallas: [
      "All of Dallas",
      "Downtown Dallas",
      "Uptown",
      "Midtown",
      "Deep Ellum",
      "Medical District", // ✅ new
      "Bishop Arts District",
      "Knox-Henderson",
      "Oak Lawn",
      "Design District",
      "Victory Park",
      "Lower Greenville",
      "Trinity Groves",
      "South Dallas",
    ],
    Houston: [
      "All of Houston",
      "Downtown Houston",
      "Midtown",
      "Montrose",
      "The Heights",
      "Medical Center", // ✅ new
      "Museum District",
      "River Oaks",
      "Galleria",
      "Washington Ave",
      "East Downtown (EaDo)",
      "Greenway / Upper Kirby", // ✅ new high-end area
    ],
    "San Antonio": [
      "All of San Antonio",
      "Downtown San Antonio",
      "La Cantera/The Rim",
      "The Dominion", // ✅ new
      "Stone Oak",
      "Alamo Ranch",
      "Southtown",
      "UTSA",
      "Medical Center",
      "Universal City/Converse",
      "Westover Hills",
      "Alamo Heights",
    ],
  };

  const rentRanges = [
    "$900–$1,000",
    "$1,100–$1,200",
    "$1,300–$1,400",
    "$1,500–$1,600",
    "$1,700–$1,800",
    "$1,900–$2,000",
    "$2,100–$2,200",
    "$2,300–$2,400",
    "$2,400–$2,500",
  ];

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >
  ) => {
    const { name, value, type } = e.target;

    if (type === "checkbox" && e.target instanceof HTMLInputElement) {
      const { checked } = e.target;
      setFormData((prev) => {
        const updated = checked
          ? [...prev.neighborhoods, value]
          : prev.neighborhoods.filter((n) => n !== value);
        return { ...prev, neighborhoods: updated };
      });
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  if (isSubmitting) return;
  setIsSubmitting(true);

      // ------------------------------------------------------
  // Honeypot Bot Protection
  // Purpose: silently block automated spam submissions
  // ------------------------------------------------------
  if (formData.website) {
  console.warn("Bot submission blocked.");
  setIsSubmitting(false);
  return;
}

    // ======================================================
// Submission Flow
// 1. Short form → minimal lead + redirect
// 2. Full form → full lead + thank you page
// ======================================================

    if (isShortForm) {
      try {
        const { data, error } = await supabase.from("leads").insert([
  {
    // ======================================================
    // USER INPUT (Short Form)
    // ======================================================
    first_name: formData.firstName,
    last_name: formData.lastName,
    phone: formData.phone,
    email: formData.email,
    move_date: formData.moveDate || null,

    // ======================================================
    // SMS CONSENT
    // ======================================================
    sms_opt_in: formData.sms_consent,
    sms_consent_at: formData.sms_consent
      ? new Date().toISOString()
      : null,

    // ======================================================
    // INTERNAL NOTES / META
    // ======================================================
    notes: propertyName
      ? `Short Form | Listing: ${propertyName}`
      : "Short Form Submission",
    website: formData.website,

    // ======================================================
    // LEAD CLASSIFICATION
    // ======================================================
    lead_type: "short",
    lead_category: "renter",

    // ======================================================
    // ATTRIBUTION / TRACKING
    // ======================================================
    page_url: pageUrl,
    referrer: referrer,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_content: utmContent,
  },
]);

        if (error) {
          console.error("Error saving short form:", error);
          alert("Oops! Something went wrong. Please try again.");
          return;
        }

        // Redirect with prefilled params
        const params = new URLSearchParams({
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone,
          email: formData.email,
          moveDate: formData.moveDate,
          propertyName: propertyName || "",
        });
        setIsSubmitting(false);
     router.push(`/start-your-search?${params.toString()}`);

     // ------------------------------------------------------
// Trigger Welcome SMS for short form
// ------------------------------------------------------
if (formData.sms_consent && formData.phone) {
  fetch("/api/sms/send-welcome", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      firstName: formData.firstName,
      phone: formData.phone,
      leadType: "short",
    }),
  }).catch((err) => {
    console.error("Welcome SMS trigger failed:", err);
  });
}


        return;
      } catch (err) {
  console.error("Unexpected error:", err);
  alert("Oops! Something went wrong. Please try again.");
  setIsSubmitting(false);
  return;
}
    }

    // ======================================================
// Submit Lead to Supabase
// Includes:
// - User form data
// - Lead type/category
// - Page + UTM tracking for analytics
 // If FULL form → save to Supabase + go to Thank You page
// ======================================================
   
    try {
      const { data, error } = await supabase.from("leads").insert([
  {
    // ======================================================
    // USER INPUT (Renter Profile)
    // ======================================================
    first_name: formData.firstName,
    last_name: formData.lastName,
    phone: formData.phone,
    email: formData.email,
    move_date: formData.moveDate || null, 
    city: formData.city,
    neighborhoods: formData.neighborhoods.join(", "),
    submarkets: formData.submarkets?.join(", "),
    property_type: formData.propertyType,
    desired_rent: formData.desiredRent,
    beds: formData.beds,
    baths: formData.baths,
    income: formData.income,

    // ======================================================
    // CREDIT / SCREENING INFO (Renter-only)
    // ======================================================
    credit_history: formData.creditHistory,
    credit_score: formData.creditScore,
    broken_lease_age: formData.brokenLeaseAge,
    broken_lease_amount: formData.brokenLeaseAmount,
    eviction_court: formData.evictionCourt,
    eviction_age: formData.evictionAge,
    eviction_balance: formData.evictionBalance,
    felony_age: formData.felonyAge,
misdemeanor_age: formData.misdemeanorAge,

criminal_background: formData.criminalBackground,
criminal_charge: formData.criminalCharge,

    // ======================================================
    // NOTES / META
    // ======================================================
    notes: formData.notes,
    website: formData.website,

    // ======================================================
    // SMS CONSENT
    // ======================================================
    sms_opt_in: formData.sms_consent,
    sms_consent_at: formData.sms_consent
      ? new Date().toISOString()
      : null,

    // ======================================================
    // LEAD CLASSIFICATION
    // ======================================================
    lead_type: "full",
    lead_category: "renter",

    // ======================================================
    // ATTRIBUTION / SOURCE
    // ======================================================
    source: utmSource ?? "direct",
  },
]);

      if (error) {
  console.error("FULL ERROR:", JSON.stringify(error, null, 2));
  alert(
    "Yikes! There was an error submitting the form. Please try again."
  );
  setIsSubmitting(false);
  return;
}

      console.log("Lead submitted successfully to Supabase!", data);
      await fetch("/api/google/create-contact", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    firstName: formData.firstName,
    lastName: formData.lastName,
    phone: formData.phone,
    city: formData.city || "Lead",
  }),
});

// ------------------------------------------------------
// Send Confirmation Email to Lead (Non-blocking)
// ------------------------------------------------------
if (formData.email) {
  try {
    // 1️⃣ Fetch renter template
    const params = new URLSearchParams({
  firstName: formData.firstName,
  city: formData.city,
  moveDate: formData.moveDate,
  budget: formData.desiredRent,
  beds: formData.beds,
  baths: formData.baths,
  propertyType: formData.propertyType,
  neighborhoods: formData.neighborhoods.join(", "),
  submarkets: formData.submarkets?.join(", ") || "",
  creditScore: formData.creditScore,
  creditHistory: formData.creditHistory,
  brokenLeaseAge: formData.brokenLeaseAge || "",
  brokenLeaseAmount: formData.brokenLeaseAmount || "",
  evictionCourt: formData.evictionCourt || "",
  evictionAge: formData.evictionAge || "",
  evictionBalance: formData.evictionBalance || "",
  felonyAge: formData.felonyAge || "",
  misdemeanorAge: formData.misdemeanorAge || "",
  notes: formData.notes || "",
});

const templateRes = await fetch(
  `/api/templates/renter?${params.toString()}`
);

    const templateHtml = await templateRes.text();

    // 2️⃣ Send email using template
    await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: formData.email,
      subject: `${formData.city} Search Update`,
        html: templateHtml,
      }),
    });
  } catch (err) {
    console.error("Lead confirmation email failed:", err);
  }
}

      // ------------------------------------------------------
// Trigger Welcome SMS (non-blocking)
// ------------------------------------------------------
if (formData.sms_consent && formData.phone) {
  fetch("/api/sms/send-welcome", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      firstName: formData.firstName,
      phone: formData.phone,
      leadType: "full",
    }),
  }).catch((err) => {
    console.error("Welcome SMS trigger failed:", err);
  });
}


 // ======================================================
// Post-Submit Redirect
// Purpose: Confirmation + UX flow
// ======================================================
      router.push(
  `/thank-you?firstName=${encodeURIComponent(
    formData.firstName
  )}&city=${encodeURIComponent(formData.city)}`
);


      // Smooth scroll after redirect
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, 200);
    } catch (err) {
  console.error("Unexpected error:", err);
  alert("Yikes! There was an error submitting the form. Please try again.");
  setIsSubmitting(false);
}
  };

  const inputStyle = {
    width: "100%",
    padding: "0.75rem",
    borderRadius: "6px",
    border: "1px solid #ccc",
    fontSize: "1rem",
    fontFamily: "'Inter', sans-serif",
  };

  const sectionStyle = { marginBottom: "1rem" };

  const noteStyle = {
    fontSize: "0.85rem",
    color: "#555",
    marginTop: "0.25rem",
  };

// ------------------------------------------------------
// Layout & Styling
// IMPORTANT:
// - This form OWNS its background, border, and shadow
// - Do NOT wrap this component in styled containers
// - Layout components (ListingLayout / ReviewLayout)
//   should ONLY control positioning, not appearance
// ------------------------------------------------------


  return (
    <form
  onSubmit={handleSubmit}
  style={{
    backgroundColor: "#f9f9f9",
    padding: "1.5rem",
    borderRadius: "8px",

    // ✅ RESTORED border (matches ListingLayout)
    border: "1px solid #e0e0e0",

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
      {/* Dynamic Heading */}
      {isShortForm && (
        <h2
          style={{
            fontSize: "1.5rem",
            marginTop: "0",
            marginBottom: "0.75rem",
            textAlign: "center",
            fontWeight: "bold",
            paddingTop: "0",
          }}
        >
          Start Your Search
        </h2>
      )}
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
          placeholder="Email"
          type="email"
          name="email"
          value={formData.email}
          onChange={handleChange}
          required
          style={inputStyle}
        />
      </div>
      {/* DESIRED MOVE DATE */}
      <div style={sectionStyle}>
        <DatePicker
          selected={formData.moveDate ? new Date(formData.moveDate) : null}
          onChange={(date: Date | null) => {
            setFormData({
              ...formData,
              moveDate: date ? date.toISOString().split("T")[0] : "",
            });
          }}
          placeholderText="Desired Move-In Date"
          dateFormat="MM/dd/yyyy"
          className="form-input"
        />
      </div>
      {/* CITY */}
      {!isShortForm && (
        <div style={sectionStyle}>
          <select
            name="city"
            value={formData.city}
            onChange={handleChange}
            required
            style={inputStyle}
          >
            <option value="">Select City</option>
            {Object.keys(cityNeighborhoods).map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </div>
      )}
      {/* Neighborhood checkboxes based on selected city */}
      {!isShortForm && formData.city && cityNeighborhoods[formData.city] && (
        <div style={{ marginBottom: "2rem" }}>
          <label
            style={{
              fontWeight: "bold",
              marginBottom: "0.5rem",
              display: "block",
            }}
          >
            Preferred Neighborhoods
          </label>

          {/* Select / Deselect All */}
          <div style={{ marginBottom: "0.75rem" }}>
            <button
              type="button"
              onClick={() =>
                setFormData((prev) => ({
                  ...prev,
                  neighborhoods: [...cityNeighborhoods[formData.city]],
                }))
              }
              style={{
                marginRight: "10px",
                padding: "6px 12px",
                fontSize: "0.9rem",
                borderRadius: "4px",
                border: "1px solid #ccc",
                background: "#f2f2f2",
              cursor: isSubmitting ? "not-allowed" : "pointer",
              opacity: isSubmitting ? 0.7 : 1,
              }}
            >
              Select All
            </button>

            <button
              type="button"
              onClick={() =>
                setFormData((prev) => ({
                  ...prev,
                  neighborhoods: [],
                }))
              }
              style={{
                padding: "6px 12px",
                fontSize: "0.9rem",
                borderRadius: "4px",
                border: "1px solid #ccc",
                background: "#f2f2f2",
                cursor: "pointer",
              }}
            >
              Deselect All
            </button>
          </div>

          {/* ✅ Neighborhood list */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.75rem",
            }}
          >
            {cityNeighborhoods[formData.city].map((neighborhood) => (
              <label
                key={neighborhood}
                style={{
                  display: "flex",
                  alignItems: "center",
                  border: "1px solid #ccc",
                  borderRadius: "6px",
                  fontSize: "0.95rem",
                  cursor: "pointer",
                  background: "#fff",
                  padding: "0.5rem 0.75rem",
                  whiteSpace: "nowrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "center" }}>
                  <input
                    type="checkbox"
                    name="neighborhoods"
                    value={neighborhood}
                    checked={formData.neighborhoods.includes(neighborhood)}
                    onChange={(e) => {
                      const { checked, value } = e.target;
                      setFormData((prev) => {
                        let updated = [...prev.neighborhoods];
                        if (value.startsWith("All of")) {
                          updated = checked
                            ? [...cityNeighborhoods[formData.city]]
                            : [];
                        } else {
                          updated = checked
                            ? [...updated, value]
                            : updated.filter((n) => n !== value);

                          if (
                            updated.length ===
                              cityNeighborhoods[formData.city].length - 1 &&
                            !updated.includes(`All of ${formData.city}`)
                          ) {
                            updated = [...cityNeighborhoods[formData.city]];
                          } else if (
                            updated.includes(`All of ${formData.city}`) &&
                            updated.length !==
                              cityNeighborhoods[formData.city].length
                          ) {
                            updated = updated.filter(
                              (n) => n !== `All of ${formData.city}`
                            );
                          }
                        }
                        return { ...prev, neighborhoods: updated };
                      });
                    }}
                    style={{
                      margin: "0 6px 0 0",
                      cursor: "pointer",
                    }}
                  />
                  <span>{neighborhood}</span>
                </div>
              </label>
            ))}
          </div>

          {/* ✅ Nearby Submarkets – only for San Antonio */}
          {formData.city === "San Antonio" && (
            <div style={{ marginTop: "2rem" }}>
              <label
                style={{
                  fontWeight: "bold",
                  marginBottom: "0.5rem",
                  display: "block",
                }}
              >
                Nearby Submarkets
              </label>

              {/* Select / Deselect All */}
              <div style={{ marginBottom: "0.75rem" }}>
                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      submarkets: ["New Braunfels", "Boerne", "Schertz"],
                    }))
                  }
                  style={{
                    marginRight: "10px",
                    padding: "6px 12px",
                    fontSize: "0.9rem",
                    borderRadius: "4px",
                    border: "1px solid #ccc",
                    background: "#f2f2f2",
                    cursor: "pointer",
                  }}
                >
                  Select All
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      submarkets: [],
                    }))
                  }
                  style={{
                    padding: "6px 12px",
                    fontSize: "0.9rem",
                    borderRadius: "4px",
                    border: "1px solid #ccc",
                    background: "#f2f2f2",
                    cursor: "pointer",
                  }}
                >
                  Deselect All
                </button>
              </div>

              {/* ✅ Submarket boxes */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.75rem",
                }}
              >
                {["New Braunfels", "Boerne", "Schertz"].map((sub) => (
                  <label
                    key={sub}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      border: "1px solid #ccc",
                      borderRadius: "6px",
                      fontSize: "0.95rem",
                      cursor: "pointer",
                      background: "#fff",
                      padding: "0.5rem 0.75rem",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center" }}>
                      <input
                        type="checkbox"
                        name="submarkets"
                        value={sub}
                        checked={formData.submarkets?.includes(sub)}
                        onChange={(e) => {
                          const { checked, value } = e.target;
                          setFormData((prev) => {
                            const updated = checked
                              ? [...(prev.submarkets || []), value]
                              : (prev.submarkets || []).filter(
                                  (s) => s !== value
                                );
                            return { ...prev, submarkets: updated };
                          });
                        }}
                        style={{
                          margin: "0 6px 0 0",
                          cursor: "pointer",
                        }}
                      />
                      <span>{sub}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 👈 Keep this! It still closes your original neighborhood section */}
      {/* ======= If FULL form, show remaining fields ======= */}

      {!isShortForm && (
        <>
          {/* PROPERTY TYPE */}
          <div style={sectionStyle}>
            <select
              name="propertyType"
              value={formData.propertyType}
              onChange={(e) => {
                const value = e.target.value;
                let newBeds = formData.beds;
                let newBaths = formData.baths;

                if (value === "Studio") {
                  newBeds = "";
                  newBaths = "";
                } else if (value === "Rental Home") {
                  newBeds = "3+";
                  newBaths = "2";
                } else {
                  newBeds = "";
                  newBaths = "";
                }

                setFormData((prev) => ({
                  ...prev,
                  propertyType: value,
                  beds: newBeds,
                  baths: newBaths,
                }));
              }}
              style={inputStyle}
            >
              <option value="">Select Property Type</option>
              <option value="Studio">Studio</option>
              <option value="Apartment">Apartment</option>
              <option value="Townhome">Townhome</option>
              <option value="Rental Home">Rental Home</option>
              <option value="Penthouse">Penthouse</option>
              <option value="Open to All">Open to All</option>
            </select>
          </div>

          {/* BEDROOMS */}
          {formData.propertyType !== "Studio" && (
            <div style={sectionStyle}>
              <select
                name="beds"
                value={formData.beds}
                onChange={(e) => {
  const value = e.target.value;

  // Always reset baths fresh to prevent stale state
  let newBaths = "";

  // Rental Home: lock 3+ beds, default 2 baths
  if (formData.propertyType === "Rental Home") {
    newBaths = "2";
  } else {
    // Standard apartment logic
    if (value === "1") {
      newBaths = "1";
    } else if (value === "2") {
      newBaths = "2";
    } else if (value === "3+") {
      newBaths = "2";
    }
  }

  setFormData((prev) => ({
    ...prev,
    beds: value,
    baths: newBaths,
  }));
}}

                style={inputStyle}
                disabled={formData.propertyType === "Rental Home"} // 🔹 Keep it visible but disabled
              >
                <option value="">Number of Bedrooms?</option>
                <option value="1">1 Bedroom</option>
                <option value="2">2 Bedrooms</option>
                <option value="3+">3+ Bedrooms</option>
              </select>
              {formData.propertyType === "Rental Home" && (
                <div style={noteStyle}>(Rental Homes are 3+ bedrooms only)</div>
              )}
            </div>
          )}

          {/* BATHROOMS */}
          {formData.propertyType !== "Studio" && formData.beds && (
            <div style={sectionStyle}>
              <select
                name="baths"
                value={formData.baths}
                onChange={handleChange}
                style={inputStyle}
              >
                <option value="">Number of Bathrooms?</option>

                {/* 1 bath only valid for 1 bed (except rentals) */}
                <option
                  value="1"
                  disabled={
                    formData.beds !== "1" ||
                    formData.propertyType === "Rental Home"
                  }
                >
                  1 Bathroom
                </option>

                {/* 2 baths */}
                <option value="2">2 Bathrooms</option>

                {/* 3+ baths only valid for 3+ beds */}
                <option value="3+" disabled={formData.beds !== "3+"}>
                  3+ Bathrooms
                </option>
              </select>
            </div>
          )}

          {/* DESIRED RENT */}
          <div style={sectionStyle}>
            <select
              name="desiredRent"
              value={formData.desiredRent}
              onChange={handleChange}
              style={inputStyle}
            >
              <option value="">Desired Monthly Rent</option>
              {rentRanges.map((range) => (
                <option key={range} value={range}>
                  {range}
                </option>
              ))}
            </select>
          </div>

         {/* CREDIT SCORE */}
<div style={sectionStyle}>
  <input
    type="number"
    name="creditScore"
    placeholder="Estimated Credit Score"
    value={formData.creditScore}
    onChange={handleChange}
    required
    style={inputStyle}
    min="300"
    max="850"
    step="1"
    inputMode="numeric"
  />

  <div style={noteStyle}>
    You can check Credit Karma for free. Your exact score helps us match you with apartments that are more likely to approve you.
  </div>
</div>

{/* RENTAL BACKGROUND */}
<div style={sectionStyle}>
  <label
    style={{
      fontWeight: "bold",
      marginBottom: "0.5rem",
      display: "block",
    }}
  >
    Rental Background
  </label>

  <select
    name="creditHistory"
    value={formData.creditHistory}
    onChange={handleChange}
    style={inputStyle}
    required
  >
    <option value="">Select Rental Background</option>
    <option value="Clean">No Broken Lease or Eviction</option>
    <option value="Broken Lease">Broken Lease</option>
    <option value="Eviction">Eviction</option>
  </select>

  <div
    style={{
      background: "#fff8e1",
      border: "1px solid #f0d98a",
      padding: "12px",
      borderRadius: "6px",
      fontSize: "0.9rem",
      marginTop: "0.75rem",
      color: "#555",
      lineHeight: "1.5",
    }}
  >
    Please answer honestly. Some apartments are flexible depending on
    the situation, and this helps us match you with communities that
    are more likely to approve you.
  </div>
</div>

 {/* Broken Lease */}
          {formData.creditHistory === "Broken Lease" && (
            <>
             <div style={sectionStyle}>
  <select
    name="brokenLeaseAge"
    value={formData.brokenLeaseAge}
    onChange={handleChange}
    style={inputStyle}
  >
    <option value="">How old is the broken lease?</option>
    <option value="Less than 1 year">Less than 1 year</option>
    <option value="1 year">1 year</option>
    <option value="2 years">2 years</option>
    <option value="3 years">3 years</option>
    <option value="5 years">5 years</option>
    <option value="7+ years">7+ years</option>
  </select>
</div>
              <div style={sectionStyle}>
                <select
  name="brokenLeaseAmount"
  value={formData.brokenLeaseAmount}
  onChange={handleChange}
  style={inputStyle}
>
  <option value="">Approximate balance owed</option>
  <option value="Less than $500">Less than $500</option>
  <option value="$500-$1,000">$500-$1,000</option>
  <option value="$1,000-$2,000">$1,000-$2,000</option>
  <option value="$2,000-$5,000">$2,000-$5,000</option>
  <option value="$5,000+">$5,000+</option>
</select>
              </div>
            </>
          )}

          {/* Eviction */}
          {formData.creditHistory === "Eviction" && (
            <>
              <div style={sectionStyle}>
                <select
                  name="evictionCourt"
                  value={formData.evictionCourt}
                  onChange={handleChange}
                  style={inputStyle}
                >
                  <option value="">Did it go to court?</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div style={sectionStyle}>
  <select
    name="evictionAge"
    value={formData.evictionAge}
    onChange={handleChange}
    style={inputStyle}
  >
    <option value="">How old is the eviction?</option>
    <option value="Less than 1 year">Less than 1 year</option>
    <option value="1 year">1 year</option>
    <option value="2 years">2 years</option>
    <option value="3 years">3 years</option>
    <option value="5 years">5 years</option>
    <option value="7+ years">7+ years</option>
  </select>
</div>
              <div style={sectionStyle}>
                <input
                  placeholder="Approximate balance owed"
                  name="evictionBalance"
                  value={formData.evictionBalance}
                  onChange={handleChange}
                  style={inputStyle}
                />
              </div>
            </>
          )}

{/* CRIMINAL BACKGROUND */}
<div style={sectionStyle}>
  <label
    style={{
      fontWeight: "bold",
      marginBottom: "0.5rem",
      display: "block",
    }}
  >
    Criminal Background
  </label>

  <select
    name="criminalBackground"
    value={formData.criminalBackground || ""}
    onChange={handleChange}
    style={inputStyle}
  >
    <option value="">Select Criminal Background</option>
    <option value="None">No Criminal Background</option>
    <option value="Misdemeanor">Misdemeanor</option>
    <option value="Felony">Felony</option>
  </select>

  <div style={noteStyle}>
    Some communities have restrictions based on certain offenses. This helps us avoid wasting your time on properties that may not work.
  </div>
</div>

{/* Criminal Charge Details */}
{formData.criminalBackground &&
  formData.criminalBackground !== "None" && (
 <div style={sectionStyle}>
  <select
    name="criminalCharge"
    value={formData.criminalCharge || ""}
    onChange={handleChange}
    style={inputStyle}
  >
    <option value="">Select Charge Type</option>
    <option value="DWI">DWI</option>
    <option value="Drug Related">Drug Related</option>
    <option value="Assault">Assault</option>
    <option value="Theft / Fraud">Theft / Fraud</option>
    <option value="Sex Offense">Sex Offense</option>
    <option value="Other">Other</option>
  </select>
</div>
)}

          {/* CONDITIONAL LOGIC FIELDS */}

          {/* Felony */}
{formData.criminalBackground === "Felony" && (
  <>
    <div style={sectionStyle}>
      <select
        name="felonyAge"
        value={formData.felonyAge}
        onChange={handleChange}
        style={inputStyle}
      >
        <option value="">How old is the felony?</option>
        <option value="Less than 1 year">Less than 1 year</option>
        <option value="1 year">1 year</option>
        <option value="2 years">2 years</option>
        <option value="3 years">3 years</option>
        <option value="5 years">5 years</option>
        <option value="7+ years">7+ years</option>
      </select>
    </div>
  </>
)}

{/* Misdemeanor */}
{formData.criminalBackground === "Misdemeanor" && (
  <>
    <div style={sectionStyle}>
      <select
        name="misdemeanorAge"
        value={formData.misdemeanorAge}
        onChange={handleChange}
        style={inputStyle}
      >
        <option value="">How old is the misdemeanor?</option>
        <option value="Less than 1 year">Less than 1 year</option>
        <option value="1 year">1 year</option>
        <option value="2 years">2 years</option>
        <option value="3 years">3 years</option>
        <option value="5 years">5 years</option>
        <option value="7+ years">7+ years</option>
      </select>
    </div>
  </>
)}

          {/* NOTES */}
          <div style={sectionStyle}>
            <textarea
              placeholder="Anything else we should know?"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={4}
              style={{ ...inputStyle, fontFamily: "'Inter', sans-serif" }}
            />
          </div>
        </>
      )}
      {/* Honeypot Field (hidden from humans) */}
      <input
        type="text"
        name="website"
        value={formData.website}
        onChange={handleChange}
        style={{ display: "none" }}
        tabIndex={-1}
        autoComplete="off"
      />

{/* SMS & Email Consent — FULL FORM ONLY */}
{!isShortForm && (
  <div className="consent-row">
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
    />
    <label htmlFor="smsConsent">
      I agree to receive texts & emails about my search and opt-out anytime.
    </label>
  </div>
)}


      {/* SUBMIT BUTTON */}
<button
  type="submit"
  disabled={isSubmitting}
  style={{
    backgroundColor: "#28a745",
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
    {isSubmitting ? "Submitting..." : "Send My List"}
      </button>
      <style>
        {`
    input, select, textarea {
      box-sizing: border-box;
      width: 100% !important;
      padding: 0.75rem !important;
      border-radius: 6px !important;
      border: 1px solid #ccc !important;
      font-size: 1rem !important;
      font-family: 'Inter', sans-serif !important;
    }
  `}
      </style>
    </form>
  );
};

export default ContactForm;
