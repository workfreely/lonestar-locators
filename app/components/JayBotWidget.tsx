"use client";

import React, { useEffect, useState } from "react";
import Vapi from "@vapi-ai/web";

interface JayBotWidgetProps {
  delay?: number;
}

const JayBotWidget: React.FC<JayBotWidgetProps> = ({ delay = 3000 }) => {
  const [vapi, setVapi] = useState<Vapi | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [showWidget, setShowWidget] = useState(false);
  const [showBadge, setShowBadge] = useState(false);
  const [minimized, setMinimized] = useState(false);

  // 🔁 Text fallback state
const [showTextFallback, setShowTextFallback] = useState(false);
const [textInput, setTextInput] = useState("");
const [messages, setMessages] = useState<
  { role: "user" | "assistant"; content: string }[]
>([]);


  // ==========================================
  // Environment variables (PUBLIC)
  // ==========================================
  const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY!;
  const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID!;

  // ==========================================
  // Delay showing avatar + bubble
  // ==========================================
  useEffect(() => {
    const timer = setTimeout(() => setShowWidget(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  // ==========================================
  // Show unread badge after widget appears
  // ==========================================
  useEffect(() => {
    if (!showWidget) return;
    const badgeTimer = setTimeout(() => setShowBadge(true), 30000);
    return () => clearTimeout(badgeTimer);
  }, [showWidget]);

  // ==========================================
  // Initialize Vapi SDK (THIS IS THE KEY FIX)
  // ==========================================
  useEffect(() => {
    if (!publicKey || !assistantId) {
      console.error("❌ Missing Vapi env vars");
      return;
    }

    const instance = new Vapi(publicKey);

    instance.on("call-start", () => {
      setIsReady(true);
      setShowBadge(false);
    });

    instance.on("call-end", () => {
      setIsReady(false);
    });

    instance.on("error", (e) => {
  console.error("Vapi error:", e);
  setIsReady(false);

  // 🔁 FALL BACK TO TEXT MODE
  setShowTextFallback(true);
  setMinimized(false);
});


    setVapi(instance);

    return () => {
      instance.stop();
    };
  }, [publicKey, assistantId]);

  if (!showWidget) return null;

  // ==========================================
  // Open voice assistant
  // ==========================================
  const handleOpen = async () => {
  setMinimized(false);

  if (!vapi) {
    setShowTextFallback(true);
    return;
  }

  try {
    await vapi.start(assistantId);
    setShowBadge(false);
    setShowTextFallback(false);
  } catch (err) {
    console.error("Failed to start assistant:", err);
    setShowTextFallback(true);
  }
};

  // ==========================================
  // Minimize bubble
  // ==========================================
  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMinimized(true);
  };

  // ==========================================
  // UI
  // ==========================================
  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* 🟦 CHAT BUBBLE */}
      {!minimized && (
        <div
          onClick={handleOpen}
          style={{
            position: "relative",
            background: "#0078d7",
            color: "#fff",
            padding: "10px 16px",
            borderRadius: "20px",
            fontSize: "15px",
            fontWeight: 500,
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            marginBottom: "8px",
            opacity: isReady ? 1 : 0.6,
            cursor: "pointer",
          }}
        >
          <span
            onClick={handleMinimize}
            style={{
              position: "absolute",
              top: "-6px",
              left: "-10px",
              fontSize: "18px",
              background: "white",
              color: "#0078d7",
              borderRadius: "50%",
              width: "20px",
              height: "20px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            ×
          </span>

          💬 Talk to Me

          {showBadge && (
            <div
              style={{
                position: "absolute",
                top: "-6px",
                right: "-10px",
                background: "red",
                color: "white",
                width: "22px",
                height: "22px",
                borderRadius: "50%",
                fontSize: "12px",
                fontWeight: "bold",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              1
            </div>
          )}
        </div>
      )}

      {/* 📝 TEXT FALLBACK CHAT */}
{showTextFallback && !minimized && (
  <div
    style={{
      width: "280px",
      background: "white",
      borderRadius: "12px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      padding: "10px",
      marginBottom: "8px",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
    }}
  >
    <div
      style={{
        fontSize: "13px",
        fontWeight: 600,
        color: "#0078d7",
      }}
    >
      Chat with JayBot
    </div>

    <div
      style={{
        maxHeight: "160px",
        overflowY: "auto",
        fontSize: "14px",
        display: "flex",
        flexDirection: "column",
        gap: "6px",
      }}
    >
      {messages.map((m, i) => (
        <div
          key={i}
          style={{
            alignSelf: m.role === "user" ? "flex-end" : "flex-start",
            background: m.role === "user" ? "#0078d7" : "#f1f1f1",
            color: m.role === "user" ? "white" : "black",
            padding: "6px 10px",
            borderRadius: "12px",
            maxWidth: "85%",
          }}
        >
          {m.content}
        </div>
      ))}
    </div>

    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!textInput.trim()) return;

        setMessages((prev) => [
          ...prev,
          { role: "user", content: textInput },
          {
            role: "assistant",
            content:
              "Thanks! I can help you find apartments. What city and move-in date are you looking for?",
          },
        ]);

        setTextInput("");
      }}
    >
      <input
        value={textInput}
        onChange={(e) => setTextInput(e.target.value)}
        placeholder="Type your message..."
        style={{
          width: "100%",
          padding: "8px",
          borderRadius: "8px",
          border: "1px solid #ccc",
          fontSize: "14px",
        }}
      />
    </form>
  </div>
)}


      {/* 🟡 AVATAR */}
      <div
        onClick={handleOpen}
        style={{
          backgroundImage:
            "url('https://res.cloudinary.com/dxtiguwzm/image/upload/v1748014964/jay-morris-free-apartment-locator-san-antonio-texas_pgf7fs.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          borderRadius: "50%",
          width: "70px",
          height: "70px",
          border: "3px solid white",
          cursor: "pointer",
          position: "relative",
          boxShadow: isReady
            ? "0 6px 18px rgba(0,0,0,0.25)"
            : "0 0 25px rgba(0,120,215,0.6)",
          animation: isReady ? "none" : "pulse 1.5s infinite",
        }}
      >
        {minimized && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              setMinimized(false);
            }}
            style={{
              position: "absolute",
              bottom: "-6px",
              right: "-6px",
              background: "white",
              color: "#0078d7",
              width: "20px",
              height: "20px",
              borderRadius: "50%",
              fontSize: "14px",
              fontWeight: "bold",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            ×
          </span>
        )}
      </div>

      {/* Animations */}
      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); box-shadow: 0 0 0 rgba(0,120,215,0.4); }
          50% { transform: scale(1.05); box-shadow: 0 0 20px rgba(0,120,215,0.8); }
          100% { transform: scale(1); box-shadow: 0 0 0 rgba(0,120,215,0.4); }
        }
      `}</style>
    </div>
  );
};

export default JayBotWidget;
