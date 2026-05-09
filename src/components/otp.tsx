import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { setJob } from "../store/jobStore";

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// No ✓ key — auto-submits on 6th digit. Empty string = invisible spacer.
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9","","0", "⌫"];

export default function OTPPage() {
  const [digits, setDigits]         = useState<string[]>(Array(6).fill(""));
  const [activeIdx, setActiveIdx]   = useState(0);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [shake, setShake]           = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const now                         = useClock();
  const navigate                    = useNavigate();
  const digitRefs                   = useRef<(HTMLDivElement | null)[]>([]);

  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

  const submitOTP = useCallback(async (currentDigits: string[]) => {
    const otp = currentDigits.join("");
    setLoading(true);
    setError(null);

    try {
      const res = await invoke("verify_otp_commands", { otp });

      const job =
        (res as any)?.data?.job ||
        (res as any)?.job ||
        (res as any)?.data ||
        res;

      setJob(job);
      navigate("/files");
    } catch (err: any) {
      setLoading(false);
      setError("Invalid PIN. Please try again.");
      setShake(true);
      setTimeout(() => {
        setShake(false);
        setError(null);
        setDigits(Array(6).fill(""));
        setActiveIdx(0);
      }, 700);
    }
  }, [navigate]);

  const handleKey = useCallback(
    (key: string) => {
      if (loading || key === "") return;

      setPressedKey(key);
      setTimeout(() => setPressedKey(null), 130);

      if (key === "⌫") {
        setError(null);
        setDigits((prev) => {
          const next = [...prev];
          const clearIdx =
            activeIdx > 0 && next[activeIdx] === "" ? activeIdx - 1 : activeIdx;
          next[clearIdx] = "";
          setActiveIdx(Math.max(0, clearIdx));
          return next;
        });
        return;
      }

      // Number key
      if (activeIdx < 6) {
        setDigits((prev) => {
          const next = [...prev];
          next[activeIdx] = key;
          // Auto-submit when last digit entered
          if (activeIdx === 5) {
            setTimeout(() => submitOTP(next), 80);
          }
          return next;
        });
        setActiveIdx((i) => Math.min(5, i + 1));
      }
    },
    [activeIdx, loading, submitOTP]
  );

  // Physical keyboard support
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") handleKey(e.key);
      else if (e.key === "Backspace") handleKey("⌫");
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
            background: "#ffffff",
            border: "none", borderRadius: "12px",
            color: "#7E49F2", fontSize: "15px", fontWeight: 600,
            padding: "15px 38px", cursor: "pointer",
            backdropFilter: "blur(8px)",
            transition: "background 0.2s",
            fontFamily: "'Sora', sans-serif",
          }}
             onMouseEnter={(e) => (e.currentTarget.style.background = "#ffffff")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
       
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
              <img src="../../public/lorenta.png" alt="logo" />
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
              const isFocused = i === activeIdx && !loading;
              const isFilled  = d !== "";
              return (
                <div
                  key={i}
                  ref={(el) => { digitRefs.current[i] = el; }}
                  onClick={() => !loading && setActiveIdx(i)}
                  style={{
                    width: "clamp(44px,7vw,60px)",
                    height: "clamp(54px,8vw,70px)",
                    borderRadius: "50%",
                    background: isFilled
                      ? "rgba(255,255,255,0.95)"
                      : "rgba(255,255,255,0.12)",
                    border: shake && isFilled
                      ? "2px solid rgba(255,100,100,0.8)"
                      : isFocused
                      ? "2.5px solid white"
                      : "2px solid rgba(255,255,255,0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "clamp(20px,3vw,28px)",
                    fontWeight: 800,
                    color: isFilled ? "#7E49F2" : "transparent",
                    cursor: loading ? "default" : "pointer",
                    transition: "all 0.18s ease",
                    boxShadow: isFocused
                      ? "0 0 0 4px rgba(255,255,255,0.2), 0 8px 20px rgba(0,0,0,0.15)"
                      : "0 4px 12px rgba(0,0,0,0.12)",
                    transform: isFocused ? "translateY(-3px) scale(1.06)" : "scale(1)",
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  {isFilled ? "●" : (
                    isFocused && (
                      <div style={{
                        width: "1px", height: "28px",
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

          {/* Error / verifying status */}
          <div style={{ height: "18px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {error ? (
              <p style={{ color: "#ffaaaa", fontSize: "13px", fontWeight: 600, margin: 0, animation: "fadeIn 0.2s ease" }}>
                {error}
              </p>
            ) : loading ? (
              <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "13px", fontWeight: 500, margin: 0 }}>
                Verifying…
              </p>
            ) : null}
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
          {KEYS.map((key, idx) => {
    
            const isBlank   = key === "";
            const isDelete  = key === "⌫";
            const isPressed = pressedKey === key;

            // Bottom-right spacer — invisible, keeps grid alignment
            if (isBlank) return <div key={idx} />;

            return (
              <button
                key={key}
                onClick={() => handleKey(key)}
                disabled={loading}
                style={{
                  height: "clamp(58px,8vh,72px)",
                  borderRadius: "28px",
                  border: isDelete
                    ? "2px solid rgba(255,255,255,0.2)"
                    : "2px solid rgba(255,255,255,0.18)",
                  background: isDelete
                    ? "#ffffff"
                    : isPressed
                    ? "rgba(255,255,255,0.30)"
                    : "rgba(255,255,255,0.14)",
                  color: isDelete ? "#7E49F2" : "white",
                  fontSize: isDelete ? "22px" : "clamp(20px,2.5vw,26px)",
                  fontWeight: isDelete ? 600 : 700,
                  cursor: loading ? "default" : "pointer",
                  transform: isPressed ? "scale(0.93)" : "scale(1)",
                  transition: "all 0.13s ease",
                  boxShadow: isPressed
                    ? "inset 0 2px 6px rgba(0,0,0,0.18)"
                    : "0 4px 12px rgba(0,0,0,0.12)",
                  backdropFilter: "blur(8px)",
                  fontFamily: "'Sora', sans-serif",
                  letterSpacing: isDelete ? "0" : "0.5px",
                  opacity: loading ? 0.5 : 1,
                }}
              >
                {key}
              </button>
            );
          })}
        </div>
      </div>

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
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}