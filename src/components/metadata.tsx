import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

interface PrintJobFile {
  file_id: string;
  file_name: string;
  printing_mode: string | null;
  printing_side: string | null;
  page_range: string[];
  page_layout: number | null;
  copies: number | null;
  number_of_pages: number | null;
  price: number | null;
  file_status: string;
  download_url?: string;
}

const MOCK_FILES: PrintJobFile[] = [
  {
    file_id: "f-001",
    file_name: "Annual_Report_2024.pdf",
    printing_mode: "Color",
    printing_side: "Double-Sided",
    page_range: ["1-10", "15", "20-25"],
    page_layout: 1,
    copies: 3,
    number_of_pages: 42,
    price: 189.0,
    file_status: "Ready",
    download_url: "https://example.com/files/annual-report.pdf",
  },
  {
    file_id: "f-002",
    file_name: "Project_Proposal_Final.docx",
    printing_mode: "Black & White",
    printing_side: "Single-Sided",
    page_range: ["1-8"],
    page_layout: 2,
    copies: 1,
    number_of_pages: 8,
    price: 24.0,
    file_status: "Ready",
  },
  {
    file_id: "f-003",
    file_name: "Presentation_Slides_Q4.pptx",
    printing_mode: "Color",
    printing_side: "Single-Sided",
    page_range: ["1-30"],
    page_layout: 4,
    copies: 5,
    number_of_pages: 30,
    price: 375.0,
    file_status: "Ready",
  },
];

const FILE_EXT_COLORS: Record<string, string> = {
  pdf: " #F2CB07",
  docx: " #F2CB07",
  pptx: " #F2CB07",
  xlsx: "#18a06b",
};

function getExt(name: string) {
  return name.split(".").pop()?.toLowerCase() || "";
}

function FileCard({ file, idx }: { file: PrintJobFile; idx: number }) {
  const ext = getExt(file.file_name);
  const extColor = FILE_EXT_COLORS[ext] || "#7E49F2";
  const CUT = 32;

  return (
    <div
      style={{
        position: "relative",
        background: "white",
        clipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${CUT}px), calc(100% - ${CUT}px) 100%, 0 100%)`,
        borderRadius: "18px",
        boxShadow: "0 6px 24px rgba(0,0,0,0.09), 0 1px 4px rgba(0,0,0,0.05)",
        animation: "slideUp 0.45s ease both",
        animationDelay: `${idx * 0.1}s`,
      }}
    >
      {/* Left accent bar */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0,
        width: "5px",
        background: extColor,
        borderRadius: "18px 0 0 18px",
      }} />

      {/* Corner triangle accent */}
      <div style={{
        position: "absolute", bottom: 0, right: 0,
        width: `${CUT}px`, height: `${CUT}px`,
        background: `${extColor}18`,
        clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
        pointerEvents: "none",
      }} />

      {/* Content */}
      <div style={{ padding: "20px 24px 20px 28px" }}>

        {/* File name + ext badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          <div style={{
            background: `${extColor}15`,
            border: `1.5px solid ${extColor}30`,
            borderRadius: "8px",
            padding: "3px 9px",
            fontSize: "11px",
            fontWeight: 800,
            color: extColor,
            letterSpacing: "0.8px",
            textTransform: "uppercase" as const,
            flexShrink: 0,
          }}>
            {ext}
          </div>
          <div style={{
            fontWeight: 700,
            fontSize: "15px",
            color: "#1a1a2e",
            letterSpacing: "-0.2px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {file.file_name}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: "1px", background: "#f0f0f5", marginBottom: "14px" }} />

        {/* Specs grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "8px",
        }}>
          <Spec label="Mode"   value={file.printing_mode  || "—"} accent={extColor} />
          <Spec label="Side"   value={file.printing_side  || "—"} accent={extColor} />
          <Spec label="Copies" value={file.copies        != null ? `${file.copies}`          : "—"} accent={extColor} />
          <Spec label="Pages"  value={file.number_of_pages != null ? `${file.number_of_pages}` : "—"} accent={extColor} />
          <Spec label="Layout" value={file.page_layout    != null ? `${file.page_layout}-up`  : "—"} accent={extColor} />
          <Spec label="Range"  value={file.page_range.length > 0 ? file.page_range.join(", ") : "All"} accent={extColor} />
        </div>
      </div>
    </div>
  );
}

function Spec({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ background: "#f7f7fb", borderRadius: "10px", padding: "9px 11px" }}>
      <div style={{
        fontSize: "10px", color: "#b0b0c0", fontWeight: 700,
        letterSpacing: "0.6px", textTransform: "uppercase" as const, marginBottom: "3px",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: "13px", fontWeight: 700, color: "#2d2d4e",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {value}
      </div>
    </div>
  );
}

export default function MetadataPage() {
  const navigate = useNavigate();
  const now = useClock();

  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

  const totalPages  = MOCK_FILES.reduce((s, f) => s + (f.number_of_pages ?? 0), 0);
  const totalCopies = MOCK_FILES.reduce((s, f) => s + (f.copies ?? 0), 0);

  return (
    <div style={{
      width: "100vw", height: "100vh",
      backgroundColor: "#7E49F2",
      fontFamily: "'Sora', sans-serif",
      display: "flex", flexDirection: "column",
      overflow: "hidden", position: "relative",
    }}>
      {/* BG circles */}
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
        <div>
          <div style={{ color: "white", fontWeight: 800, fontSize: "clamp(18px,2.2vw,26px)", letterSpacing: "-0.3px" }}>
            Print Queue
          </div>
          <div style={{ color: "rgba(255,255,255,0.58)", fontSize: "13px", marginTop: "3px" }}>
            {MOCK_FILES.length} files &middot; {totalPages} pages &middot; {totalCopies} copies
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "white", fontWeight: 800, fontSize: "clamp(17px,2.2vw,28px)", lineHeight: 1 }}>
            {time}
          </div>
          <div style={{ color: "rgba(255,255,255,0.58)", fontSize: "13px", marginTop: "3px" }}>{date}</div>
        </div>
      </div>

      {/* CARDS */}
      <div style={{
        flex: 1, overflowY: "auto",
        padding: "clamp(16px,2.5vh,28px) clamp(22px,3vw,44px) 120px",
        display: "flex", flexDirection: "column", gap: "14px",
      }}>
        {MOCK_FILES.map((file, idx) => (
          <FileCard key={file.file_id} file={file} idx={idx} />
        ))}
      </div>

      {/* FIXED BOTTOM BUTTON */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        padding: "16px clamp(22px,3vw,44px) 32px",
        background: "linear-gradient(to top, rgba(70,25,185,1) 0%, rgba(70,25,185,0.95) 55%, transparent 100%)",
      }}>
        <button
          onClick={() => navigate("/print")}
          style={{
            width: "100%", height: "60px",
            background: "white", border: "none",
            borderRadius: "18px", color: "#7E49F2",
            fontSize: "17px", fontWeight: 800, letterSpacing: "0.3px",
            cursor: "pointer", boxShadow: "0 10px 32px rgba(0,0,0,0.20)",
            fontFamily: "'Sora', sans-serif",
            transition: "transform 0.15s ease",
          }}
          onMouseDown={(e) => { e.currentTarget.style.transform = "scale(0.97)"; }}
          onMouseUp={(e)   => { e.currentTarget.style.transform = "scale(1)"; }}
          onTouchStart={(e) => { e.currentTarget.style.transform = "scale(0.97)"; }}
          onTouchEnd={(e)   => { e.currentTarget.style.transform = "scale(1)"; }}
        >
          Continue to Print
        </button>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&display=swap');
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        ::-webkit-scrollbar { width: 0px; }
      `}</style>
    </div>
  );
}