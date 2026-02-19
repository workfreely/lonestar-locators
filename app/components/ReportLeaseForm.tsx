"use client";

import { useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabaseClient";

export default function ReportLeaseForm() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    otherApplicants: "",
    phone: "",
    email: "",
    propertyName: "",
    unitNumber: "",
    city: "",
    baseRent: "",
    leaseTerm: "",
    rebateChoice: "",
    moveDate: "",
    notes: "",
    listedJayMorris: false,
    website: "", // honeypot
  });

const handleChange = (
  e: React.ChangeEvent<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >
) => {
  const target = e.target;
  const name = target.name;

  if (target instanceof HTMLInputElement && target.type === "checkbox") {
    setFormData((prev) => ({
      ...prev,
      [name]: target.checked,
    }));
  } else {
    setFormData((prev) => ({
      ...prev,
      [name]: target.value,
    }));
  }
};

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  // Honeypot
  if (formData.website) return;

  try {
    const trimmedFirst = formData.firstName.trim();
    const trimmedLast = formData.lastName.trim();
    const trimmedProperty = formData.propertyName.trim();
    const trimmedCity = formData.city.trim();

    const { error } = await supabase.from("reported_leases").insert([
      {
  first_name: trimmedFirst,
  last_name: trimmedLast,
  email: formData.email,
  phone: formData.phone,
  city: trimmedCity,
  property_name: trimmedProperty,
  unit_number: formData.unitNumber,
  lease_term: formData.leaseTerm,
  base_rent: Number(formData.baseRent),  // ✅ Fixed
  move_in_date: formData.moveDate,
  incentive_selected: formData.rebateChoice,
  listed_jay_morris: formData.listedJayMorris,
  other_applicants: formData.otherApplicants, // ✅ since you added it
  notes: formData.notes,
  page_url:
    typeof window !== "undefined"
      ? window.location.pathname
      : null,
  lead_type: "lease_report",
},
    ]);

    if (error) {
      if (error.code === "23505") {
        alert(
          "It looks like this lease has already been reported for this property. If this is a mistake, please contact us."
        );
        return;
      }

      console.error("Error saving lease report:", error);
      alert("Something went wrong. Please try again.");
      return;
    }

    // ======================================================
    // 1️⃣ CLIENT CONFIRMATION EMAIL
    // ======================================================
    if (formData.email) {
      try {
        const templateRes = await fetch(
          `/api/templates/report-lease?firstName=${encodeURIComponent(
            trimmedFirst
          )}&incentive=${encodeURIComponent(
            formData.rebateChoice
          )}&propertyName=${encodeURIComponent(
            trimmedProperty
          )}&moveInDate=${encodeURIComponent(
            formData.moveDate || ""
          )}`
        );

        const templateHtml = await templateRes.text();

        await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: formData.email,
            subject: "Lease Reported Successfully",
            html: templateHtml,
          }),
        });
      } catch (err) {
        console.error("Client confirmation email failed:", err);
      }
    }

    // ======================================================
    // 2️⃣ INTERNAL NOTIFICATION (FULL BRANDED VERSION)
    // ======================================================
try {
  await fetch("/api/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: "jay@lonestarlocators.app",
      subject: `New Lease Report: ${trimmedFirst} ${trimmedLast} (${trimmedCity})`,
      html: `
        <h2>New Lease Report Submitted</h2>

        <p><strong>Name:</strong> ${trimmedFirst} ${trimmedLast}</p>
        <p><strong>Other Applicants:</strong> ${
          formData.otherApplicants || "None"
        }</p>
        <p><strong>Email:</strong> ${formData.email}</p>
        <p><strong>Phone:</strong> ${formData.phone}</p>
        <p><strong>City:</strong> ${trimmedCity}</p>
        <p><strong>Property:</strong> ${trimmedProperty}</p>
        <p><strong>Unit:</strong> ${formData.unitNumber || "N/A"}</p>
        <p><strong>Lease Term:</strong> ${formData.leaseTerm} months</p>
        <p><strong>Base Rent:</strong> $${formData.baseRent}</p>
        <p><strong>Move-In Date:</strong> ${formData.moveDate}</p>
        <p><strong>Incentive:</strong> ${formData.rebateChoice}</p>
        <p><strong>Listed Jay Morris:</strong> ${
          formData.listedJayMorris ? "Yes" : "No"
        }</p>
        <p><strong>Notes:</strong> ${formData.notes || "None"}</p>
      `,
    }),
  });
} catch (err) {
  console.error("Internal lease notification failed:", err);
}

    // ======================================================
    // 3️⃣ REDIRECT
    // ======================================================
    router.push(
      `/report-lease-thank-you?firstName=${encodeURIComponent(
        trimmedFirst
      )}&incentive=${encodeURIComponent(formData.rebateChoice)}`
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    alert("Unexpected error submitting form.");
  }
};

  const inputStyle = {
    width: "100%",
    padding: "0.75rem",
    borderRadius: "6px",
    border: "1px solid #ccc",
    fontSize: "1rem",
    fontFamily: "'Inter', sans-serif",
    boxSizing: "border-box" as const,
  };

  const sectionStyle = { marginBottom: "1rem" };

  const cities = ["Austin", "Dallas", "Houston", "San Antonio"];
  const leaseTerms = [12, 13, 14, 15, 16, 17, 18];

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
      }}
    >
      <div style={sectionStyle}>
        <input
          name="firstName"
          placeholder="First Name"
          value={formData.firstName}
          onChange={handleChange}
          required
          style={inputStyle}
        />
      </div>

      <div style={sectionStyle}>
        <input
          name="lastName"
          placeholder="Last Name"
          value={formData.lastName}
          onChange={handleChange}
          required
          style={inputStyle}
        />
      </div>

      <div style={sectionStyle}>
        <input
          name="otherApplicants"
          placeholder="Other Applicants on Lease (if any)"
          value={formData.otherApplicants}
          onChange={handleChange}
          style={inputStyle}
        />
      </div>

      {/* Phone — matches ContactForm formatting */}
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
                : `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(
                    6,
                    10
                  )}`;
            setFormData((prev) => ({ ...prev, phone: formatted }));
          }}
          maxLength={14}
          required
          style={inputStyle}
        />
      </div>

      <div style={sectionStyle}>
        <input
          name="email"
          type="email"
          placeholder="Email"
          value={formData.email}
          onChange={handleChange}
          required
          style={inputStyle}
        />
      </div>

      <div style={sectionStyle}>
        <input
          name="propertyName"
          placeholder="Property Name"
          value={formData.propertyName}
          onChange={handleChange}
          required
          style={inputStyle}
        />
      </div>

      <div style={sectionStyle}>
        <input
          name="unitNumber"
          placeholder="Unit Number"
          value={formData.unitNumber}
          onChange={handleChange}
          style={inputStyle}
        />
      </div>

      <div style={sectionStyle}>
        <select
          name="city"
          value={formData.city}
          onChange={handleChange}
          required
          style={inputStyle}
        >
          <option value="">Select City</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div style={sectionStyle}>
        <input
          name="baseRent"
          type="number"
          placeholder="Base Rent Amount"
          value={formData.baseRent}
          onChange={handleChange}
          required
          style={inputStyle}
        />
      </div>

      <div style={sectionStyle}>
        <select
          name="leaseTerm"
          value={formData.leaseTerm}
          onChange={handleChange}
          required
          style={inputStyle}
        >
          <option value="">Lease Term</option>
          {leaseTerms.map((term) => (
            <option key={term} value={term}>
              {term} months
            </option>
          ))}
        </select>
      </div>

      <div style={sectionStyle}>
  <select
    name="rebateChoice"
    value={formData.rebateChoice}
    onChange={handleChange}
    required
    style={inputStyle}
  >
    <option value="">Select Reward</option>
    <option value="cash">
      Cash Rebate (issued within 90 days of move-in)
    </option>
    <option value="movers">
      2 Hours Free Movers
    </option>
  </select>
</div>

{/* Conditional Notes */}
{formData.rebateChoice === "cash" && (
  <p style={{ fontSize: "0.9rem", color: "#555", marginBottom: "1rem" }}>
    Rebate amounts vary by property and lease term. After verification,
    your rebate will be issued within 90 days of your move-in date.
  </p>
)}

{formData.rebateChoice === "movers" && (
  <p style={{ fontSize: "0.9rem", color: "#555", marginBottom: "1rem" }}>
    Once your lease and move-in date are verified, we will coordinate
    directly with the moving company to schedule your service.
  </p>
)}

      <div style={sectionStyle}>
        <DatePicker
          selected={formData.moveDate ? new Date(formData.moveDate) : null}
          onChange={(date: Date | null) =>
            setFormData({
              ...formData,
              moveDate: date ? date.toISOString().split("T")[0] : "",
            })
          }
          placeholderText="Move-In Date"
          dateFormat="MM/dd/yyyy"
          className="form-input"
          required
        />
      </div>

      <div style={sectionStyle}>
        <textarea
          name="notes"
          placeholder="Any notes (optional)"
          value={formData.notes}
          onChange={handleChange}
          rows={3}
          style={inputStyle}
        />
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "flex", alignItems: "center" }}>
          <input
            type="checkbox"
            name="listedJayMorris"
            checked={formData.listedJayMorris}
            onChange={handleChange}
            required
            style={{ marginRight: "0.5rem" }}
          />
          <strong>
            I listed Jay Morris with AptAmigo on my application
          </strong>
        </label>
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

      <button
        type="submit"
        style={{
          backgroundColor: "#28a745",
          color: "#fff",
          padding: "0.75rem",
          borderRadius: "6px",
          border: "none",
          width: "100%",
          fontSize: "1rem",
          cursor: "pointer",
        }}
      >
        Report Lease
      </button>
    </form>
  );
}
