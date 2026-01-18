"use client";

import React, { useEffect, useState } from "react";
import { FaFacebook, FaLink, FaSms } from "react-icons/fa";

type ShareBlockProps = {
  url?: string;
};

const ShareBlock: React.FC<ShareBlockProps> = ({ url }) => {
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  // ✅ Run ONLY on client
  useEffect(() => {
    setShareUrl(url || window.location.href);
  }, [url]);

  const handleCopy = async () => {
    if (!shareUrl) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = shareUrl;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy link", err);
    }
  };

  return (
    <div
      style={{
        padding: "2rem",
        borderRadius: "12px",
        backgroundColor: "#f8faf9",
        border: "1px solid #e3e8e5",
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontSize: "1.05rem",
          color: "#666",
          marginBottom: "1.5rem",
          fontWeight: 500,
        }}
      >
        Share this with a friend who’s apartment hunting 👇
      </p>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        {/* Copy Link */}
        <button onClick={handleCopy} type="button" style={buttonStyle}>
          <FaLink />
          {copied ? "Link Copied ✓" : "Copy Link"}
        </button>

        {/* Text / SMS (client-only safe) */}
        {shareUrl && (
          <a
            href={`sms:?&body=${encodeURIComponent(
              `Check this out — free apartment locating: ${shareUrl}`
            )}`}
            style={buttonStyle}
          >
            <FaSms />
            Text
          </a>
        )}

        {/* Facebook */}
        {shareUrl && (
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
              shareUrl
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ ...buttonStyle, color: "#4267B2" }}
          >
            <FaFacebook />
            Facebook
          </a>
        )}
      </div>
    </div>
  );
};

const buttonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "12px 18px",
  borderRadius: "8px",
  border: "1px solid #cfd6d2",
  backgroundColor: "#ffffff",
  cursor: "pointer",
  fontWeight: 600,
  fontSize: "1rem",
  textDecoration: "none",
  color: "#222",
};

export default ShareBlock;
