import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getJob } from "../store/jobStore";

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const FILE_EXT_COLORS: Record<string, string> = {
  pdf:  "#F2CB07",
  docx: "#F2CB07",
  pptx: "#F2CB07",
  xlsx: "#18a06b",
};

function getExt(name: string) {
  return name.split(".").pop()?.toLowerCase() || "";
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#EEF4FF", borderRadius: "10px", padding: "9px 11px" }}>
      <div style={{
        fontSize: "10px", color: "#93acd3", fontWeight: 700,
        letterSpacing: "0.6px", textTransform: "uppercase" as const, marginBottom: "3px",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: "13px", fontWeight: 700, color: "#2d4a7a",
        whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {value}
      </div>
    </div>
  );
}

function FileCard({ file, idx }: { file: any; idx: number }) {
  const ext = getExt(file.file_name);
  const extColor = FILE_EXT_COLORS[ext] || "#7E49F2";
  const CUT = 32;

  return (
    <div style={{
      position: "relative",
      background: "white",
      clipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${CUT}px), calc(100% - ${CUT}px) 100%, 0 100%)`,
      borderRadius: "18px",
      boxShadow: "0 6px 24px rgba(0,0,0,0.09), 0 1px 4px rgba(0,0,0,0.05)",
      animation: "slideUp 0.45s ease both",
      animationDelay: `${idx * 0.1}s`,
      overflow: "hidden",
      flexShrink: 0,
    }}>
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0,
        width: "5px", background: extColor, borderRadius: "18px 0 0 18px",
      }} />
      <div style={{
        position: "absolute", bottom: 0, right: 0,
        width: `${CUT}px`, height: `${CUT}px`,
        background: `${extColor}18`,
        clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
        pointerEvents: "none" as const,
      }} />
      <div style={{ padding: "20px 24px 20px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          <div style={{
            background: `${extColor}15`,
            border: `1.5px solid ${extColor}30`,
            borderRadius: "8px", padding: "3px 9px", fontSize: "11px",
            fontWeight: 800, color: extColor, letterSpacing: "0.8px",
            textTransform: "uppercase" as const, flexShrink: 0,
          }}>
            {ext}
          </div>
          <div style={{
            fontWeight: 700, fontSize: "15px", color: "#1a1a2e",
            letterSpacing: "-0.2px", whiteSpace: "nowrap" as const,
            overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {file.file_name}
          </div>
        </div>
        <div style={{ height: "1px", background: "#e8f0fb", marginBottom: "14px" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
          <Spec label="Mode"   value={file.printing_mode  || "—"} />
          <Spec label="Side"   value={file.printing_side  || "—"} />
          <Spec label="Copies" value={file.copies != null ? `${file.copies}` : "—"} />
          <Spec label="Pages"  value={file.number_of_pages != null ? `${file.number_of_pages}` : "—"} />
          <Spec label="Layout" value={file.page_layout != null ? `${file.page_layout}-up` : "—"} />
          <Spec label="Range"  value={file.page_range?.length > 0 ? file.page_range.join(", ") : "All"} />
        </div>
      </div>
    </div>
  );
}

export default function MetadataPage() {
  const navigate  = useNavigate();
  const now       = useClock();
  const job       = getJob();
  const files     = job?.files ?? [];

  const [secsLeft, setSecsLeft]         = useState(60);
  const [timerWarning, setTimerWarning] = useState(false);
// Add this function inside the component, before the return
const playTouch = () => {
  const audio = new Audio("/music/touch.wav");
  audio.play().catch(() => {});
};
  const resetTimer = useCallback(() => {
    setSecsLeft(60);
    setTimerWarning(false);
  }, []);
console.log(secsLeft);
console.log(timerWarning);
  useEffect(() => {
    const t = setInterval(() => {
      setSecsLeft((prev) => {
        if (prev <= 1) { clearInterval(t); navigate("/"); return 0; }
        if (prev - 1 <= 10) setTimerWarning(true);
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [navigate]);

  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

  const totalPages  = files.reduce((s: number, f: any) => s + (f.number_of_pages ?? 0), 0);
  const totalCopies = files.reduce((s: number, f: any) => s + (f.copies ?? 0), 0);

  if (!job) {
    return (
      <div style={{
        width: "100vw", height: "100vh", backgroundColor: "#7E49F2",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: "16px", fontFamily: "'Sora', sans-serif",
      }}>
        <div style={{ color: "white", fontSize: "32px" }}>⚠️</div>
        <div style={{ color: "white", fontWeight: 700, fontSize: "16px" }}>No job data found.</div>
        <button
          onClick={() => navigate(-1)}
          style={{
            padding: "10px 28px", background: "white", border: "none",
            borderRadius: "12px", color: "#7E49F2", fontWeight: 800,
            fontSize: "14px", cursor: "pointer", fontFamily: "'Sora', sans-serif",
          }}
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={resetTimer}
      onTouchStart={resetTimer}
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
      {/* Background circles */}
      <div style={{
        position: "absolute", top: "-90px", right: "-90px",
        width: "340px", height: "340px", borderRadius: "50%",
        background: "rgba(255,255,255,0.06)", pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: "80px", left: "-70px",
        width: "240px", height: "240px", borderRadius: "50%",
        background: "rgba(255,255,255,0.04)", pointerEvents: "none",
      }} />

      {/* TOP BAR */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "clamp(18px,2.5vh,36px) clamp(22px,3vw,44px) 0",
        flexShrink: 0,
      }}>
        {/* Left: back icon + title + subtitle */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
       <button
  onClick={(e) => {
    e.stopPropagation();
    playTouch();
    navigate(-1);
  }}
  style={{
    width: "44px",
    height: "44px",
    background: "rgba(255,255,255,0.15)",
    border: "1.5px solid rgba(255,255,255,0.25)",
    borderRadius: "14px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "background 0.15s ease, transform 0.15s ease",
    flexShrink: 0,
  }}
  onMouseEnter={(e) => {
    e.currentTarget.style.background = "rgba(255,255,255,0.25)";
  }}
  onMouseLeave={(e) => {
    e.currentTarget.style.background = "rgba(255,255,255,0.15)";
  }}
  onMouseDown={(e) => {
    e.currentTarget.style.transform = "scale(0.92)";
  }}
  onMouseUp={(e) => {
    e.currentTarget.style.transform = "scale(1)";
  }}
  onTouchStart={(e) => {
    e.stopPropagation();
    e.currentTarget.style.transform = "scale(0.92)";
  }}
  onTouchEnd={(e) => {
    e.currentTarget.style.transform = "scale(1)";
  }}
>
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="white"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="15 18 9 12 15 6" />
  </svg>
</button>
          <div>
            <div style={{ color: "white", fontWeight: 800, fontSize: "clamp(18px,2.2vw,26px)", letterSpacing: "-0.3px" }}>
              Print Queue
            </div>
            <div style={{ color: "rgba(255,255,255,0.58)", fontSize: "13px", marginTop: "3px" }}>
              {files.length} file{files.length !== 1 ? "s" : ""} · {totalPages} pages · {totalCopies} cop{totalCopies !== 1 ? "ies" : "y"}
            </div>
          </div>
        </div>

        {/* Right: clock */}
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "white", fontWeight: 800, fontSize: "clamp(17px,2.2vw,28px)", lineHeight: 1 }}>
            {time}
          </div>
          <div style={{ color: "rgba(255,255,255,0.58)", fontSize: "13px", marginTop: "3px" }}>{date}</div>
        </div>
      </div>

      {/* ── CARDS ONLY scroll zone ── */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        padding: "clamp(16px,2.5vh,28px) clamp(22px,3vw,44px) 16px",
        gap: "14px",
        minHeight: 0,          /* critical — lets flex child shrink below content size */
      }}>
        {files.map((file: any, idx: number) => (
          <FileCard key={file.file_id} file={file} idx={idx} />
        ))}
      </div>

      {/* ── LOCKED BOTTOM — never scrolls ── */}
      <div style={{
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        padding: "10px clamp(22px,3vw,44px) 32px",
      }}>

       

        {/* Glass amount card */}
        <div style={{
          borderRadius: "20px",
          background: "rgba(255,255,255,0.12)",
          border: "1.5px solid rgba(255,255,255,0.28)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          padding: "16px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: "0 8px 32px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.25)",
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            <span style={{
              color: "rgba(255,255,255,0.55)", fontSize: "11px", fontWeight: 700,
              letterSpacing: "0.8px", textTransform: "uppercase" as const,
              fontFamily: "'Sora', sans-serif",
            }}>
              Total Amount
            </span>
            <span style={{
              color: "white", fontSize: "28px", fontWeight: 800,
              letterSpacing: "-0.5px", lineHeight: 1,
              fontFamily: "'Sora', sans-serif",
            }}>
              ₹{job.total_amount}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
            <span style={{
              fontSize: "11px", color: "rgba(255,255,255,0.45)",
              fontFamily: "'Sora', sans-serif",
            }}>
              {files.length} file{files.length !== 1 ? "s" : ""} · {totalPages} pages
            </span>
          </div>
        </div>

        {/* Continue to Print */}
        <button
  onClick={(e) => {
    e.stopPropagation();
    playTouch();
    navigate("/print", { state: { job } });
  }}
  style={{
    width: "100%",
    height: "58px",
    background: "white",
    border: "none",
    borderRadius: "9999px",
    color: "#7E49F2",
    fontSize: "17px",
    fontWeight: 800,
    letterSpacing: "0.2px",
    cursor: "pointer",
    fontFamily: "'Sora', sans-serif",
    boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    transition: "transform 0.15s ease",
  }}
  onMouseDown={(e) => {
    e.currentTarget.style.transform = "scale(0.97)";
  }}
  onMouseUp={(e) => {
    e.currentTarget.style.transform = "scale(1)";
  }}
  onTouchStart={(e) => {
    e.currentTarget.style.transform = "scale(0.97)";
  }}
  onTouchEnd={(e) => {
    e.currentTarget.style.transform = "scale(1)";
  }}
>
  <span>Continue to Print</span>
  <span style={{ fontSize: "19px", lineHeight: 1 }}>🖨</span>
</button>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&display=swap');
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        ::-webkit-scrollbar { width: 0px; }
      `}</style>
    </div>
  );
}