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

  // 📝 Text fallback
  const [showTextFallback, setShowTextFallback] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);

  const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY!;
  const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID!;

  /* ===============================
     AUTO-SCROLL TEXT CHAT
  =============================== */
  useEffect(() => {
    const el = document.querySelector(".jaybot-chat-messages");
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  /* ===============================
     SHOW WIDGET DELAY
  =============================== */
  useEffect(() => {
    const t = setTimeout(() => setShowWidget(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  /* ===============================
     UNREAD BADGE
  =============================== */
  useEffect(() => {
    if (!showWidget) return;
    const t = setTimeout(() => setShowBadge(true), 30000);
    return () => clearTimeout(t);
  }, [showWidget]);

  /* ===============================
     INIT VAPI
  =============================== */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!publicKey || !assistantId) return;

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
      setShowTextFallback(true);
      setMinimized(false);
    });

    setVapi(instance);

    return () => {
      try {
        instance.stop();
      } catch {}
    };
  }, [publicKey, assistantId]);

  /* ===============================
   🔒 LOCK BACKGROUND WHEN CHAT IS OPEN
   Prevents mobile page scroll + keyboard bleed
=============================== */
useEffect(() => {
  if (typeof document === "undefined") return;

  if (showTextFallback && !minimized) {
    document.body.classList.add("jaybot-open");
  } else {
    document.body.classList.remove("jaybot-open");
  }

  return () => {
    document.body.classList.remove("jaybot-open");
  };
}, [showTextFallback, minimized]);

/* ⛔️ NOTHING — NO HOOKS — BELOW THIS LINE */
if (!showWidget) return null;

  /* ===============================
     OPEN HANDLER (FIXED)
  =============================== */
  const handleOpen = async () => {
    setMinimized(false);
    setShowBadge(false);

    if (!vapi) {
      setShowTextFallback(true);
      return;
    }

    try {
      await vapi.start(assistantId);
      setShowTextFallback(false);
    } catch {
      setShowTextFallback(true);
    }
  };

  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMinimized(true);
  };

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
      {/* 💬 CHAT BUBBLE */}
      {!minimized && (
        <div
          onClick={handleOpen}
          style={{
            position: "relative",
            background: "#0078d7",
            color: "#fff",
            padding: "12px 18px",
            borderRadius: "22px",
            fontSize: "15px",
            fontWeight: 500,
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            marginBottom: "8px",
            opacity: isReady ? 1 : 0.85,
            cursor: "pointer",
          }}
        >
          <span
            onClick={handleMinimize}
            style={{
              position: "absolute",
              top: "-6px",
              left: "-10px",
              background: "white",
              color: "#0078d7",
              borderRadius: "50%",
              width: "20px",
              height: "20px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              fontWeight: "bold",
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

      {/* 📝 TEXT CHAT */}
      {showTextFallback && !minimized && (
        <div className="jaybot-chat-container">
  <div className="jaybot-chat-header">
    <div className="jaybot-chat-title">Chat with JayBot</div>
  </div>

          <div className="jaybot-chat-messages">
            {messages.map((m, i) => (
              <div
  key={i}
  className={`jaybot-message ${m.role}`}
>
                {m.content}
              </div>
            ))}
          </div>

          <form
  className="jaybot-chat-form"
  onSubmit={(e) => {

              e.preventDefault();
              if (!textInput.trim()) return;

              setMessages((prev) => [
                ...prev,
                { role: "user", content: textInput },
                {
                  role: "assistant",
                  content:
                    "Got it. What city are you searching in?",
                },
              ]);

              setTextInput("");
            }}
          >
            <input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Type your message..."
               className="jaybot-chat-input"
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
          boxShadow: isReady
            ? "0 6px 18px rgba(0,0,0,0.25)"
            : "0 0 25px rgba(0,120,215,0.6)",
          animation: isReady ? "none" : "pulse 1.5s infinite",
        }}
      />

      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default JayBotWidget;