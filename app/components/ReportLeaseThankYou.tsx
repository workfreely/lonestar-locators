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
          marginBottom: "1.5rem",
          textAlign: "center",
        }}
      >
        🎉 Lease Reported Successfully!
      </h1>

      {incentive === "cash" && (
        <p style={{ fontSize: "1.25rem", color: "#333" }}>
          {firstName ? `${firstName}, ` : ""}
          you selected a <strong>cash rebate!</strong> Your rebate will be
          processed and issued within <strong>90 days of your move-in date.</strong>
          Please allow time for verification with the apartment community.
          We’ll be in touch as soon as it’s confirmed. Congrats again on your new home!
        </p>
      )}

      {incentive === "movers" && (
        <p style={{ fontSize: "1.25rem", color: "#333" }}>
          {firstName ? `${firstName}, ` : ""}
          you selected <strong>2 hours of free moving services!</strong>
          Please allow time for verification with the apartment community.
          We’ll be in touch as soon as it’s confirmed. Congrats again on your new home!
        </p>
      )}
    </div>
  );
}
