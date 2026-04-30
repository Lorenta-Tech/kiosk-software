import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// Phase 1: downloading (0–7s), Phase 2: printing (8–15s)
const DOWNLOAD_SECONDS = 7;
const TOTAL_SECONDS = 15;

const DOWNLOAD_MESSAGES = [
  "Downloading your documents…",
  "Fetching files from server…",
  "Transferring to printer…",
];
const PRINT_MESSAGES = [
  "Sending to print machine…",
  "Printing in progress…",
  "Almost done…",
];

// Segmented bar: 5 equal blocks
const SEGMENTS = 5;

export default function LoadingPage() {
  const navigate = useNavigate();
  const [elapsed, setElapsed] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);

  const isPrinting = elapsed >= DOWNLOAD_SECONDS;
  const progress = isPrinting
    ? Math.min(((elapsed - DOWNLOAD_SECONDS) / (TOTAL_SECONDS - DOWNLOAD_SECONDS)) * 100, 100)
    : 0;

  // Segment fill: each segment = 20%, how many fully filled + partial
  const filledSegments = Math.floor(progress / 20);
  const partialFill = (progress % 20) / 20; // 0–1 within the current segment

  const messages = isPrinting ? PRINT_MESSAGES : DOWNLOAD_MESSAGES;

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        if (next >= TOTAL_SECONDS) {
          clearInterval(interval);
          navigate("/done");
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [navigate]);

  useEffect(() => {
    setMsgIdx(0);
  }, [isPrinting]);

  useEffect(() => {
    const t = setInterval(() => {
      setMsgIdx((i) => (i + 1) % messages.length);
    }, 2500);
    return () => clearInterval(t);
  }, [isPrinting]);

  return (
    <div style={{
      width: "100vw", height: "100vh",
      backgroundColor: "#7E49F2",
      fontFamily: "'Sora', sans-serif",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      overflow: "hidden", position: "relative",
      padding: "0 clamp(24px, 4vw, 56px)",
      boxSizing: "border-box",
    }}>
      {/* BG circles */}
      <div style={{ position: "absolute", top: "-110px", right: "-110px", width: "380px", height: "380px", borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "-60px", left: "-80px", width: "300px", height: "300px", borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: "35%", left: "-120px", width: "220px", height: "220px", borderRadius: "50%", background: "rgba(255,255,255,0.03)", pointerEvents: "none" }} />

      {/* ── SPINNER ── */}
      <div style={{ position: "relative", width: "180px", height: "180px", marginBottom: "44px" }}>
        {/* Outer ring */}
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.10)", borderTopColor: "rgba(255,255,255,0.35)", animation: "spin 3s linear infinite" }} />
        {/* Middle ring */}
        <div style={{ position: "absolute", inset: "16px", borderRadius: "50%", border: "3px solid rgba(255,255,255,0.10)", borderTopColor: "rgba(255,255,255,0.60)", borderRightColor: "rgba(255,255,255,0.20)", animation: "spin 2s linear infinite reverse" }} />
        {/* Inner ring */}
        <div style={{ position: "absolute", inset: "32px", borderRadius: "50%", border: "3px solid rgba(255,255,255,0.08)", borderTopColor: "white", borderRightColor: "rgba(255,255,255,0.40)", animation: "spin 1.2s linear infinite" }} />
        {/* Center */}
        <div style={{ position: "absolute", inset: "50px", borderRadius: "50%", background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid rgba(255,255,255,0.20)" }}>
          <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "white", boxShadow: "0 0 12px rgba(255,255,255,0.8)", animation: "pulse 1.5s ease-in-out infinite" }} />
        </div>
        {/* Orbiting yellow dot */}
        <div style={{ position: "absolute", inset: 0, animation: "spin 2s linear infinite" }}>
          <div style={{ position: "absolute", top: "6px", left: "50%", transform: "translateX(-50%)", width: "12px", height: "12px", borderRadius: "50%", background: "#F2CB07", boxShadow: "0 0 14px rgba(242,203,7,0.9), 0 0 28px rgba(242,203,7,0.5)" }} />
        </div>
      </div>

      {/* ── PHASE LABEL ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <div style={{
          width: "8px", height: "8px", borderRadius: "50%",
          background: isPrinting ? "#F2CB07" : "white",
          boxShadow: isPrinting ? "0 0 8px rgba(242,203,7,0.8)" : "0 0 8px rgba(255,255,255,0.8)",
          animation: "pulse 1.2s ease-in-out infinite",
          transition: "background 0.4s ease",
        }} />
        <div style={{
          fontSize: "11px", fontWeight: 700, letterSpacing: "1.2px",
          textTransform: "uppercase",
          color: isPrinting ? "#F2CB07" : "rgba(255,255,255,0.75)",
          transition: "color 0.4s ease",
        }}>
          {isPrinting ? "Printing" : "Downloading"}
        </div>
      </div>

      {/* ── STATUS MESSAGE ── */}
      <div
        key={`${isPrinting}-${msgIdx}`}
        style={{ color: "white", fontWeight: 700, fontSize: "clamp(16px,2vw,20px)", letterSpacing: "-0.3px", textAlign: "center", marginBottom: "6px", animation: "fadeSwitch 0.4s ease both" }}
      >
        {messages[msgIdx]}
      </div>
      <div style={{ color: "rgba(255,255,255,0.50)", fontSize: "13px", fontWeight: 500, textAlign: "center", marginBottom: "0" }}>
        Please do not remove your device
      </div>

      {/* ── PROGRESS BAR — only visible during printing ── */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        padding: "20px clamp(24px,4vw,56px) 36px",
        background: "linear-gradient(to top, rgba(60,20,170,1) 0%, rgba(60,20,170,0.9) 60%, transparent 100%)",
        transform: isPrinting ? "translateY(0)" : "translateY(110%)",
        transition: "transform 0.6s cubic-bezier(0.175,0.885,0.32,1.1)",
      }}>
        {/* Header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "14px" }}>
          <div>
            <div style={{ color: "white", fontSize: "15px", fontWeight: 700, letterSpacing: "-0.2px" }}>
              Print Progress
            </div>
            <div style={{ color: "rgba(255,255,255,0.50)", fontSize: "12px", marginTop: "2px" }}>
              {Math.round(progress)}% complete
            </div>
          </div>
          <div style={{
            background: "rgba(255,255,255,0.12)",
            border: "1px solid rgba(255,255,255,0.20)",
            borderRadius: "20px",
            padding: "4px 12px",
            color: "#F2CB07",
            fontSize: "12px",
            fontWeight: 700,
          }}>
            {Math.max(0, TOTAL_SECONDS - elapsed)}s left
          </div>
        </div>

        {/* Segmented bar */}
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          {Array.from({ length: SEGMENTS }).map((_, i) => {
            const isFull = i < filledSegments;
            const isPartial = i === filledSegments;
            const isEmpty = i > filledSegments;

            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: "10px",
                  borderRadius: "100px",
                  background: "rgba(255,255,255,0.12)",
                  overflow: "hidden",
                  position: "relative",
                  // Active segment pulses slightly
                  boxShadow: isPartial ? "0 0 0 1px rgba(242,203,7,0.4)" : "none",
                  transition: "box-shadow 0.3s ease",
                }}
              >
                {/* Fill layer */}
                <div style={{
                  position: "absolute", left: 0, top: 0, bottom: 0,
                  width: isFull ? "100%" : isPartial ? `${partialFill * 100}%` : "0%",
                  background: isFull
                    ? "linear-gradient(90deg, #F2CB07, #f7d94a)"
                    : isPartial
                    ? "linear-gradient(90deg, #F2CB07, #f7d94a)"
                    : "transparent",
                  borderRadius: "100px",
                  transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
                  boxShadow: (isFull || isPartial) ? "0 0 8px rgba(242,203,7,0.6)" : "none",
                }}>
                  {/* Shimmer on active segments */}
                  {(isFull || isPartial) && (
                    <div style={{
                      position: "absolute", inset: 0,
                      background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)",
                      animation: "shimmer 1.8s ease-in-out infinite",
                    }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Segment dots beneath */}
        <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
          {Array.from({ length: SEGMENTS }).map((_, i) => (
            <div key={i} style={{
              flex: 1,
              display: "flex", justifyContent: "center",
            }}>
              <div style={{
                width: "4px", height: "4px", borderRadius: "50%",
                background: i < filledSegments
                  ? "#F2CB07"
                  : i === filledSegments
                  ? "rgba(242,203,7,0.5)"
                  : "rgba(255,255,255,0.18)",
                transition: "background 0.4s ease",
                boxShadow: i <= filledSegments ? "0 0 4px rgba(242,203,7,0.5)" : "none",
              }} />
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap');
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%       { transform: scale(1.4); opacity: 0.7; }
        }
        @keyframes fadeSwitch {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}