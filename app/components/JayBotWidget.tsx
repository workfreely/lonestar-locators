"use client";

import React, { useEffect, useState } from "react";

declare global {
  interface Window {
    vapi?: any;
  }
}

interface JayBotWidgetProps {
  delay?: number;
}

const JayBotWidget: React.FC<JayBotWidgetProps> = ({ delay = 3000 }) => {
  const [isReady, setIsReady] = useState(false);
  const [showWidget, setShowWidget] = useState(false);
  const [showBadge, setShowBadge] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
  const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;

  // Show widget after delay
  useEffect(() => {
    const t = setTimeout(() => setShowWidget(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  // Show badge after 30s
  useEffect(() => {
    if (!showWidget) return;
    const t = setTimeout(() => setShowBadge(true), 30000);
    return () => clearTimeout(t);
  }, [showWidget]);

  // Load Vapi widget script (CORRECT)
  useEffect(() => {
    if (!publicKey || !assistantId) {
      console.error("❌ Missing Vapi env vars");
      return;
    }

    if (window.vapi) return;

    const script = document.createElement("script");
    script.src =
      "https://jsdelivrproxy.glitch.me/https://vapi.ai/widget.js";
    script.async = true;

    script.onload = () => {
      if (!window.vapi) {
        console.error("❌ Vapi script loaded but window.vapi missing");
        return;
      }

      window.vapi.init({
        apiKey: publicKey,
        assistantId,
        autoOpen: false,
        position: "bottom-right",
        theme: {
          brandColor: "#0078d7",
          title: "Talk to Me 🤠",
        },
      });

      console.log("✅ Vapi initialized");
      setIsReady(true);
    };

    document.body.appendChild(script);
  }, [publicKey, assistantId]);

  if (!showWidget) return null;

  const handleOpen = () => {
    if (!window.vapi) {
      console.error("❌ Vapi not ready");
      return;
    }
    window.vapi.open();
    setShowBadge(false);
    setMinimized(false);
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {!minimized && (
        <div
          onClick={handleOpen}
          style={{
            position: "relative",
            background: "#0078d7",
            color: "#fff",
            padding: "10px 16px",
            borderRadius: 20,
            marginBottom: 8,
            opacity: isReady ? 1 : 0.4,
            cursor: "pointer",
          }}
        >
          💬 Talk to Me
          {showBadge && (
            <div
              style={{
                position: "absolute",
                top: -6,
                right: -10,
                background: "red",
                width: 22,
                height: 22,
                borderRadius: "50%",
                color: "#fff",
                fontSize: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              1
            </div>
          )}
        </div>
      )}

      <div
        onClick={handleOpen}
        style={{
          width: 70,
          height: 70,
          borderRadius: "50%",
          backgroundImage:
            "url('https://res.cloudinary.com/dxtiguwzm/image/upload/v1748014964/jay-morris-free-apartment-locator-san-antonio-texas_pgf7fs.png')",
          backgroundSize: "cover",
          border: "3px solid white",
          cursor: "pointer",
          boxShadow: isReady
            ? "0 6px 18px rgba(0,0,0,0.25)"
            : "0 0 25px rgba(0,120,215,0.6)",
          animation: isReady ? "none" : "pulse 1.5s infinite",
        }}
      />

      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.06); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default JayBotWidget;
