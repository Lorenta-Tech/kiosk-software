import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function ThankYouPage() {
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);

  // Redirect to home after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => navigate("/"), 3000);
    return () => clearTimeout(timer);
  }, [navigate]);

  // Tick for countdown ring animation
  useEffect(() => {
    const t = setInterval(() => setTick((p) => p + 1), 50);
    return () => clearInterval(t);
  }, []);

  // SVG ring: circumference for a r=22 circle
  const CIRCUM = 2 * Math.PI * 22; // ~138.2
  const elapsed = Math.min(tick * 50, 3000);
  const dashOffset = CIRCUM * (1 - elapsed / 3000);

  return (
    <div style={{
      width: "100vw", height: "100vh",
      backgroundColor: "#7E49F2",
      fontFamily: "'Sora', sans-serif",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      overflow: "hidden", position: "relative",
    }}>

      {/* ── BACKGROUND RINGS ── */}
      {[400, 600, 800, 1000].map((size, i) => (
        <div key={i} style={{
          position: "absolute",
          width: `${size}px`, height: `${size}px`,
          borderRadius: "50%",
          border: `1px solid rgba(255,255,255,${0.06 - i * 0.01})`,
          animation: `expandRing ${1.2 + i * 0.3}s cubic-bezier(0.2,0.8,0.4,1) both`,
          animationDelay: `${i * 0.12}s`,
          pointerEvents: "none",
        }} />
      ))}

      {/* ── BURST PARTICLES ── */}
      {Array.from({ length: 12 }).map((_, i) => {
        const angle = (i / 12) * 360;
        const dist = 160 + (i % 3) * 30;
        const size = 4 + (i % 4) * 3;
        const isYellow = i % 3 === 0;
        return (
          <div key={i} style={{
            position: "absolute",
            width: `${size}px`, height: `${size}px`,
            borderRadius: "50%",
            background: isYellow ? "#F2CB07" : "rgba(255,255,255,0.7)",
            boxShadow: isYellow
              ? "0 0 10px rgba(242,203,7,0.8)"
              : "0 0 6px rgba(255,255,255,0.5)",
            transform: `rotate(${angle}deg) translateY(-${dist}px)`,
            animation: `burstIn 0.8s cubic-bezier(0.2,0.8,0.4,1) both`,
            animationDelay: `${0.15 + i * 0.04}s`,
            pointerEvents: "none",
          }} />
        );
      })}

      {/* ── CHECKMARK CIRCLE ── */}
      <div style={{
        position: "relative",
        width: "120px", height: "120px",
        marginBottom: "36px",
        animation: "popIn 0.6s cubic-bezier(0.175,0.885,0.32,1.275) both",
        animationDelay: "0.1s",
      }}>
        {/* Outer glow */}
        <div style={{
          position: "absolute", inset: "-12px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(242,203,7,0.20) 0%, transparent 70%)",
          animation: "glowPulse 2s ease-in-out infinite",
        }} />

        {/* Circle bg */}
        <div style={{
          position: "absolute", inset: 0,
          borderRadius: "50%",
          background: "white",
          boxShadow: "0 16px 48px rgba(0,0,0,0.18), 0 0 0 6px rgba(255,255,255,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {/* SVG checkmark */}
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
            <path
              d="M12 26L22 36L40 16"
              stroke="#7E49F2"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                strokeDasharray: 50,
                strokeDashoffset: 0,
                animation: "drawCheck 0.5s ease both",
                animationDelay: "0.4s",
              }}
            />
          </svg>
        </div>

        {/* Countdown ring around the circle */}
        <svg
          style={{ position: "absolute", inset: "-6px", width: "132px", height: "132px" }}
          viewBox="0 0 56 56"
        >
          <circle
            cx="28" cy="28" r="26"
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="2"
          />
          <circle
            cx="28" cy="28" r="26"
            fill="none"
            stroke="#F2CB07"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 26}`}
            strokeDashoffset={`${2 * Math.PI * 26 * (elapsed / 3000)}`}
            transform="rotate(-90 28 28)"
            style={{ transition: "stroke-dashoffset 0.05s linear" }}
          />
        </svg>
      </div>

      {/* ── THANK YOU TEXT ── */}
      <div style={{
        animation: "riseUp 0.7s cubic-bezier(0.2,0.8,0.4,1) both",
        animationDelay: "0.35s",
        textAlign: "center",
        marginBottom: "12px",
      }}>
        <div style={{
          fontSize: "clamp(36px, 6vw, 56px)",
          fontWeight: 800,
          color: "white",
          letterSpacing: "-1.5px",
          lineHeight: 1.05,
        }}>
          Thank You!
        </div>
      </div>

      {/* ── VISIT AGAIN ── */}
      <div style={{
        animation: "riseUp 0.7s cubic-bezier(0.2,0.8,0.4,1) both",
        animationDelay: "0.5s",
        textAlign: "center",
        marginBottom: "40px",
      }}>
        <div style={{
          fontSize: "clamp(15px, 2vw, 20px)",
          fontWeight: 600,
          color: "rgba(255,255,255,0.70)",
          letterSpacing: "0.2px",
        }}>
          Visit Again
        </div>

      
      </div>

      {/* ── PRINT COMPLETE BADGE ── */}
      <div style={{
        animation: "riseUp 0.6s ease both",
        animationDelay: "0.65s",
      }}>
        <div style={{
          background: "rgba(255,255,255,0.10)",
          border: "1.5px solid rgba(255,255,255,0.20)",
          borderRadius: "100px",
          padding: "10px 24px",
          backdropFilter: "blur(12px)",
          display: "flex", alignItems: "center", gap: "8px",
        }}>
          
        
        </div>
      </div>

  

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap');

        @keyframes popIn {
          from { transform: scale(0.4); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        @keyframes riseUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes expandRing {
          from { transform: scale(0); opacity: 0.8; }
          to   { transform: scale(1); opacity: 1; }
        }
        @keyframes burstIn {
          from { opacity: 0; transform: rotate(var(--angle, 0deg)) translateY(0px) scale(0); }
          to   { opacity: 1; }
        }
        @keyframes drawCheck {
          from { stroke-dashoffset: 50; }
          to   { stroke-dashoffset: 0; }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.1); }
        }
        @keyframes expandWidth {
          from { width: 0; }
          to   { width: 100%; }
        }
      `}</style>
    </div>
  );
}