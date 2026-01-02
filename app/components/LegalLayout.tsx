import React from "react";

interface LegalLayoutProps {
  title: string;
  children: React.ReactNode;
}

const LegalLayout = ({ title, children }: LegalLayoutProps) => {
  return (
    <div
      style={{
        maxWidth: "860px",
        margin: "3rem auto",
        padding: "2rem",
        fontFamily: "'Inter', sans-serif",
        lineHeight: "1.75",
        color: "#333",
      }}
    >
      {/* Page Title */}
      <h1
        style={{
          fontSize: "2.6rem",
          fontWeight: 800,
          textAlign: "center",
          marginBottom: "2.5rem",
          color: "#111",
        }}
      >
        {title}
      </h1>

      {/* Content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
          fontSize: "1.05rem",
        }}
      >
        {React.Children.map(children, (child) => {
          if (!React.isValidElement(child)) return child;

          // Force consistent styling for headings and paragraphs
          if (child.type === "h2") {
            return React.cloneElement(child as React.ReactElement, {
              style: {
                fontSize: "1.3rem",
                fontWeight: 700,
                marginTop: "2rem",
                marginBottom: "0.5rem",
                color: "#111",
              },
            });
          }

          if (child.type === "p") {
            return React.cloneElement(child as React.ReactElement, {
              style: {
                marginBottom: "0.5rem",
              },
            });
          }

          return child;
        })}
      </div>
    </div>
  );
};

export default LegalLayout;
