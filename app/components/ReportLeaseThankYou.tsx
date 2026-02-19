"use client";

type Props = {
  firstName?: string;
  incentive?: "cash" | "movers";
};

export default function ReportLeaseThankYou({
  firstName,
  incentive,
}: Props) {
  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        padding: "4rem 1.5rem",
        textAlign: "left",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <h1
  style={{
    fontSize: "2.6rem",
    fontWeight: 800,
    marginBottom: "1rem",
    textAlign: "center", // ✅ ONLY THIS LINE
  }}
>
  🎉 Lease Reported Successfully
  {firstName ? `, ${firstName}!` : "!"}
</h1>
      {incentive === "cash" && (
        <p style={{ fontSize: "1.25rem", color:  "#333" }}>
          You selected a <strong>cash rebate!</strong> Once your lease is
          verified with the property, we’ll confirm eligibility and next steps.
        </p>
      )}

      {incentive === "movers" && (
        <p style={{ fontSize: "1.25rem", color: "#333" }}>
          You selected <strong>2 hours of free moving services!</strong>
        </p>
      )}

      <p style={{ marginTop: "1.1rem", fontSize: "1.25rem", color:  "#333" }}>
        Please allow time for verification with the apartment community. We’ll
        be in touch by text or email as soon as it's confirmed. Congrats again on your new home! 
      </p>
    </div>
  );
}
