import { useEffect, useRef } from "react";

export default function OfflinePopup() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio("/music/alert.wav");
    audio.loop = true;
    audio.play().catch(() => {});
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, []);

  return (
    <div
      style={{
        position:        "fixed",
        inset:           0,
        backgroundColor: "rgba(126, 73, 242, 0.55)",
        backdropFilter:  "blur(6px)",
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "center",
        zIndex:          9999,
        fontFamily:      "'Sora', sans-serif",
      }}
    >
      <div
        style={{
          background:   "white",
          borderRadius: "24px",
          padding:      "48px 40px",
          textAlign:    "center",
          width:        "340px",
          boxShadow:    "0 24px 64px rgba(0,0,0,0.18)",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width:          "72px",
            height:         "72px",
            borderRadius:   "50%",
            background:     "#F3EFFE",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            margin:         "0 auto 20px",
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
            stroke="#7E49F2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
        </div>

        <h2
          style={{
            fontSize:   "22px",
            fontWeight: 700,
            color:      "#1a1a2e",
            margin:     "0 0 10px",
          }}
        >
          No Internet Connection
        </h2>

        <p
          style={{
            fontSize:   "14px",
            color:      "#888",
            margin:     "0 0 28px",
            lineHeight: 1.6,
          }}
        >
          Please check your network connection and try again.
        </p>

        {/* Pulsing waiting indicator */}
        <div
          style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            gap:            "8px",
            background:     "#F3EFFE",
            borderRadius:   "10px",
            padding:        "12px 20px",
          }}
        >
          <div style={{ animation: "pulse 1.2s ease-in-out infinite" }}>
            <div
              style={{
                width:        "8px",
                height:       "8px",
                borderRadius: "50%",
                background:   "#7E49F2",
              }}
            />
          </div>
          <span style={{ fontSize: "13px", color: "#7E49F2", fontWeight: 600 }}>
            Waiting for connection...
          </span>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.7); }
        }
      `}</style>
    </div>
  );
}