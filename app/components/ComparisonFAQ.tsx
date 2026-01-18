"use client";

import React from "react";
import { ComparisonProperty } from "./ComparisonLayout";

/* =========================================
   FAQ STYLES
========================================= */

const faqStyle: React.CSSProperties = {
  marginBottom: "10px",
  padding: "12px 16px",
  border: "1px solid #e5e7eb",
  borderRadius: "8px",
  backgroundColor: "#fafafa",
};

const faqSummary: React.CSSProperties = {
  fontWeight: 600,
  cursor: "pointer",
  fontSize: "1.05rem",
  lineHeight: "1.6",
  color: "#333",
};

const faqContent: React.CSSProperties = {
  marginTop: "10px",
  color: "#555",
  lineHeight: "1.6",
};

/* =========================================
   COMPONENT
========================================= */

const ComparisonFAQ = ({
  left,
  right,
  cityName,
}: {
  left: ComparisonProperty;
  right: ComparisonProperty;
  cityName: string;
}) => {
  return (
    <div style={{ marginTop: "3rem" }}>
      <h2
        style={{
          marginBottom: "1rem",
          fontSize: "2rem",
          fontWeight: 800,
          color: "#111",
          textAlign: "left",
        }}
      >
        Frequently Asked Questions
      </h2>

      {(left.good[0] || right.good[0]) && (
        <details style={faqStyle}>
          <summary style={faqSummary}>
            What are the main differences between {left.name} and {right.name}?
          </summary>
          <div style={faqContent}>
            {left.good[0] && (
              <p>
                <strong>{left.name}:</strong> {left.good[0]}
              </p>
            )}
            {right.good[0] && (
              <p>
                <strong>{right.name}:</strong> {right.good[0]}
              </p>
            )}
          </div>
        </details>
      )}

      {(left.bad[0] || right.bad[0]) && (
        <details style={faqStyle}>
          <summary style={faqSummary}>
            What are the downsides of each apartment?
          </summary>
          <div style={faqContent}>
            {left.bad[0] && (
              <p>
                <strong>{left.name}:</strong> {left.bad[0]}
              </p>
            )}
            {right.bad[0] && (
              <p>
                <strong>{right.name}:</strong> {right.bad[0]}
              </p>
            )}
          </div>
        </details>
      )}

      {(left.ugly[0] || right.ugly[0]) && (
        <details style={faqStyle}>
          <summary style={faqSummary}>
            What should I know before leasing at either property?
          </summary>
          <div style={faqContent}>
            {left.ugly[0] && (
              <p>
                <strong>{left.name}:</strong> {left.ugly[0]}
              </p>
            )}
            {right.ugly[0] && (
              <p>
                <strong>{right.name}:</strong> {right.ugly[0]}
              </p>
            )}
          </div>
        </details>
      )}

      {(left.rent || right.rent) && (
        <details style={faqStyle}>
          <summary style={faqSummary}>
            How much do apartments cost in {cityName} for these properties?
          </summary>
          <div style={faqContent}>
            {left.rent && (
              <p>
                <strong>{left.name}:</strong> Pricing starts around {left.rent}.
              </p>
            )}
            {right.rent && (
              <p>
                <strong>{right.name}:</strong> Pricing starts around {right.rent}.
              </p>
            )}
          </div>
        </details>
      )}

      <details style={faqStyle}>
        <summary style={faqSummary}>
          How do I get a cash rebate or free movers?
        </summary>
        <div style={faqContent}>
          List <strong>"Jay Morris with AptAmigo"</strong> on your application and{" "}
          <a
            href="/report-lease"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "#004aad",
              fontWeight: 600,
              textDecoration: "underline",
            }}
          >
            report your lease
          </a>{" "}
          after move-in.
        </div>
      </details>
    </div>
  );
};

export default ComparisonFAQ;
