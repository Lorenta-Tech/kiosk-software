import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✓"];

export default function OTPPage() {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [activeIdx, setActiveIdx] = useState(0);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [success, setSuccess] = useState(false);
  const now = useClock();
  const navigate = useNavigate();
  const digitRefs = useRef<(HTMLDivElement | null)[]>([]);

  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

  const handleKey = useCallback(
    (key: string) => {
      setPressedKey(key);
      setTimeout(() => setPressedKey(null), 150);

      if (key === "⌫") {
        setDigits((prev) => {
          const next = [...prev];
          const clearIdx = activeIdx > 0 && next[activeIdx] === "" ? activeIdx - 1 : activeIdx;
          next[clearIdx] = "";
          setActiveIdx(Math.max(0, clearIdx));
          return next;
        });
        return;
      }

      if (key === "✓") {
        const filled = digits.filter((d) => d !== "").length;
        if (filled < 6) {
          setShake(true);
          setTimeout(() => setShake(false), 500);
        } else {
          setSuccess(true);
          setTimeout(() => navigate("/files"), 1800);
        }
        return;
      }

      if (activeIdx < 6) {
        setDigits((prev) => {
          const next = [...prev];
          next[activeIdx] = key;
          return next;
        });
        setActiveIdx((i) => Math.min(5, i + 1));
      }
    },
    [activeIdx, digits, navigate]
  );

  // Physical keyboard support
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") handleKey(e.key);
      else if (e.key === "Backspace") handleKey("⌫");
      else if (e.key === "Enter") handleKey("✓");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleKey]);

  const filledCount = digits.filter((d) => d !== "").length;

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        backgroundColor: "#7E49F2",
        fontFamily: "'Sora', sans-serif",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Background decorative circles */}
      <div style={{
        position: "absolute", top: "-80px", right: "-80px",
        width: "320px", height: "320px", borderRadius: "50%",
        background: "rgba(255,255,255,0.06)", pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: "-60px", left: "-60px",
        width: "260px", height: "260px", borderRadius: "50%",
        background: "rgba(255,255,255,0.05)", pointerEvents: "none",
      }} />

      {/* TOP BAR */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "clamp(20px,3vh,40px) clamp(24px,3.5vw,48px) 0",
        flexShrink: 0,
      }}>
        <button
          onClick={() => navigate("/")}
          style={{
            background: "rgba(255,255,255,0.15)",
            border: "none", borderRadius: "12px",
            color: "white", fontSize: "15px", fontWeight: 600,
            padding: "8px 20px", cursor: "pointer",
            backdropFilter: "blur(8px)",
            transition: "background 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.25)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
        >
          ← Back
        </button>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "white", fontWeight: 800, fontSize: "clamp(18px,2.5vw,32px)", lineHeight: 1 }}>
            {time}
          </div>
          <div style={{ color: "rgba(255,255,255,0.62)", fontWeight: 500, marginTop: "4px", fontSize: "14px" }}>
            {date}
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        gap: "clamp(24px, 3.5vh, 40px)",
        padding: "0 24px",
      }}>

        {/* CARD */}
        <div style={{
          background: "rgba(255,255,255,0.10)",
          backdropFilter: "blur(20px)",
          borderRadius: "28px",
          border: "1.5px solid rgba(255,255,255,0.22)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.22)",
          padding: "clamp(28px,4vw,48px) clamp(28px,4vw,52px)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "28px",
          width: "100%",
          maxWidth: "520px",
        }}>

          {/* Header */}
          <div style={{ textAlign: "center" }}>
            <div style={{
              width: "64px", height: "64px", borderRadius: "20px",
            
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 16px",
              fontSize: "28px",
            }}>
              <img src="../../public/Lorenta-1.png"/>
            </div>
            <h1 style={{
              color: "white", fontSize: "clamp(20px,3vw,28px)",
              fontWeight: 800, margin: 0, letterSpacing: "-0.3px",
            }}>
              Enter Your PIN
            </h1>
            <p style={{
              color: "rgba(255,255,255,0.65)", fontSize: "14px",
              marginTop: "6px", fontWeight: 400,
            }}>
              Enter your 6-digit access code to continue
            </p>
          </div>

          {/* OTP Boxes */}
          <div style={{
            display: "flex", gap: "clamp(8px,1.5vw,14px)",
            animation: shake ? "shake 0.5s ease" : "none",
          }}>
            {digits.map((d, i) => {
              const isFocused = i === activeIdx;
              const isFilled = d !== "";
              return (
                <div
                  key={i}
                  ref={(el) => { digitRefs.current[i] = el; }}
                  onClick={() => setActiveIdx(i)}
                  style={{
                    width: "clamp(44px,7vw,60px)",
                    height: "clamp(54px,8vw,70px)",
                    borderRadius: "16px",
                    background: isFilled
                      ? "rgba(255,255,255,0.95)"
                      : "rgba(255,255,255,0.12)",
                    border: isFocused
                      ? "2.5px solid white"
                      : "2px solid rgba(255,255,255,0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "clamp(20px,3vw,28px)",
                    fontWeight: 800,
                    color: isFilled ? "#7E49F2" : "transparent",
                    cursor: "pointer",
                    transition: "all 0.18s ease",
                    boxShadow: isFocused
                      ? "0 0 0 4px rgba(255,255,255,0.2), 0 8px 20px rgba(0,0,0,0.15)"
                      : "0 4px 12px rgba(0,0,0,0.12)",
                    transform: isFocused ? "translateY(-3px) scale(1.06)" : "scale(1)",
                    position: "relative",
                  }}
                >
                  {isFilled ? "●" : (
                    isFocused && (
                      <div style={{
                        width: "2px", height: "28px",
                        background: "rgba(255,255,255,0.7)",
                        borderRadius: "2px",
                        animation: "blink 1s ease-in-out infinite",
                      }} />
                    )
                  )}
                </div>
              );
            })}
          </div>

          {/* Progress dots */}
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            {Array(6).fill(0).map((_, i) => (
              <div key={i} style={{
                width: i < filledCount ? "20px" : "7px",
                height: "7px",
                borderRadius: "4px",
                background: i < filledCount ? "white" : "rgba(255,255,255,0.3)",
                transition: "all 0.25s ease",
              }} />
            ))}
          </div>
        </div>

        {/* NUMBER PAD */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "clamp(10px,1.5vw,14px)",
          width: "100%",
          maxWidth: "380px",
        }}>
          {KEYS.map((key) => {
            const isDelete = key === "⌫";
            const isConfirm = key === "✓";
            const isPressed = pressedKey === key;
            const isConfirmActive = isConfirm && filledCount === 6;

            return (
              <button
                key={key}
                onClick={() => handleKey(key)}
                style={{
                  height: "clamp(58px,8vh,72px)",
                  borderRadius: "18px",
                  border: isConfirm
                    ? isConfirmActive
                      ? "2.5px solid rgba(255,255,255,0.9)"
                      : "2px solid rgba(255,255,255,0.2)"
                    : isDelete
                    ? "2px solid rgba(255,255,255,0.2)"
                    : "2px solid rgba(255,255,255,0.18)",
                  background: isConfirm
                    ? isConfirmActive
                      ? "white"
                      : "rgba(255,255,255,0.10)"
                    : isDelete
                    ? "rgba(255,100,100,0.20)"
                    : isPressed
                    ? "rgba(255,255,255,0.30)"
                    : "rgba(255,255,255,0.14)",
                  color: isConfirm
                    ? isConfirmActive ? "#7E49F2" : "rgba(255,255,255,0.35)"
                    : isDelete
                    ? "#ff8888"
                    : "white",
                  fontSize: isDelete || isConfirm ? "22px" : "clamp(20px,2.5vw,26px)",
                  fontWeight: isDelete || isConfirm ? 600 : 700,
                  cursor: "pointer",
                  transform: isPressed ? "scale(0.93)" : "scale(1)",
                  transition: "all 0.13s ease",
                  boxShadow: isPressed
                    ? "inset 0 2px 6px rgba(0,0,0,0.18)"
                    : isConfirmActive
                    ? "0 6px 20px rgba(255,255,255,0.25)"
                    : "0 4px 12px rgba(0,0,0,0.12)",
                  backdropFilter: "blur(8px)",
                  fontFamily: "'Sora', sans-serif",
                  letterSpacing: isDelete || isConfirm ? "0" : "0.5px",
                }}
              >
                {key}
              </button>
            );
          })}
        </div>
      </div>

      {/* SUCCESS OVERLAY */}
      {success && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(126,73,242,0.92)",
          backdropFilter: "blur(16px)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: "20px", zIndex: 100,
          animation: "fadeIn 0.3s ease",
        }}>
          <div style={{
            width: "100px", height: "100px", borderRadius: "50%",
            background: "white",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "48px",
            boxShadow: "0 16px 48px rgba(0,0,0,0.25)",
            animation: "popIn 0.4s cubic-bezier(0.175,0.885,0.32,1.275)",
          }}>
            ✓
          </div>
          <div style={{ color: "white", fontSize: "24px", fontWeight: 700 }}>
            Access Granted!
          </div>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "15px" }}>
            Redirecting…
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap');
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-8px); }
          30% { transform: translateX(8px); }
          45% { transform: translateX(-6px); }
          60% { transform: translateX(6px); }
          75% { transform: translateX(-3px); }
          90% { transform: translateX(3px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes popIn {
          from { transform: scale(0.5); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}