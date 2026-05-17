import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getJob } from "../store/jobStore";

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_RETRIES = 2;
const PRINT_TIMEOUT_MS = 30_000; // 30 seconds — navigate back if print hangs

// ── Types ────────────────────────────────────────────────────────────────────
type Phase = "downloading" | "printing" | "done";

interface FileProgress {
  file_id: string;
  file_name: string;
  download_status: "pending" | "downloading" | "done" | "failed";
  print_status: "pending" | "printing" | "done" | "failed";
  local_path?: string;
  print_pct?: number;
  print_current?: number;
  print_total?: number;
}

interface AlertInfo {
  icon: string;
  title: string;
  message: string;
}

interface ErrorInfo {
  message: string;
  fileName?: string;
  reason?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getExt(name: string) {
  return name.split(".").pop()?.toLowerCase() || "";
}

const EXT_COLOR: Record<string, { bg: string; border: string; text: string }> = {
  pdf:  { bg: "#F2CB0718", border: "#F2CB0755", text: "#b89300" },
  docx: { bg: "#F2CB0718", border: "#F2CB0755", text: "#b89300" },
  pptx: { bg: "#F2CB0718", border: "#F2CB0755", text: "#b89300" },
  xlsx: { bg: "#18a06b18", border: "#18a06b55", text: "#0a5c3c" },
};

function parseError(raw: string): { fileName?: string; reason?: string; message: string } {
  const match = raw.match(/Failed to print "(.+?)"[:\s]+(.+)/i);
  if (match) return { fileName: match[1], reason: match[2], message: raw };
  const dlMatch = raw.match(/Failed to download "(.+?)"/i);
  if (dlMatch) return { fileName: dlMatch[1], reason: "Download failed. Please check your connection.", message: raw };
  return { message: raw };
}

// ── Compute sheets for progress bar ──────────────────────────────────────────
// Join all page_range array elements into one comma-separated string.
// Server sends ["1-2","4"] → we need "1-2,4" for qpdf.
function joinPageRange(pageRange: string[] | null | undefined): string | null {
  if (!pageRange || pageRange.length === 0) return null;
  return pageRange.join(",");
}

function computeSheets(file: any): number {
  const layout  = file.page_layout === 2 ? 2 : 1;
  const copies  = file.copies ?? 1;
  // Join ALL elements of page_range array, not just [0]
  const range   = joinPageRange(file.page_range);

  let pageCount: number;
  if (range) {
    // Handles "1-2,4", "1-12", "3", etc.
    const parts = range.split(",");
    pageCount = parts.reduce((sum, part) => {
      const trimmed = part.trim();
      if (trimmed.includes("-")) {
        const [start, end] = trimmed.split("-").map(Number);
        return sum + (isNaN(end) ? 1 : Math.max(1, end - start + 1));
      }
      return sum + 1;
    }, 0);
  } else {
    pageCount = file.number_of_pages ?? 1;
  }

  return Math.ceil(pageCount / layout) * copies;
}

// ── Alert Sound Hook ──────────────────────────────────────────────────────────
function useAlertSound(active: boolean) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (active) {
      const isDev = window.location.protocol === "http:";
      const src = isDev ? "/music/alert.wav" : "asset://localhost/music/alert.wav";
      const audio = new Audio(src);
      audio.loop = true;
      audio.volume = 0.7;
      audio.play().catch(() => {});
      audioRef.current = audio;
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [active]);
}

// ── Printer Disconnected Modal ────────────────────────────────────────────────
function PrinterDisconnectedModal() {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(55,18,165,0.72)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "24px", animation: "fadeIn 0.22s ease" }}>
      <div style={{ background: "white", borderRadius: "28px", padding: "36px 30px 32px", maxWidth: "300px", width: "100%", textAlign: "center", boxShadow: "0 32px 80px rgba(0,0,0,0.22)", fontFamily: "'Sora', sans-serif", animation: "popIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both" }}>
        <div style={{ width: "76px", height: "76px", borderRadius: "50%", background: "#EEF0FE", border: "2px solid #7E49F2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
          <i className="ti ti-printer-off" style={{ fontSize: "32px", color: "#7E49F2" }} aria-hidden="true" />
        </div>
        <div style={{ fontSize: "19px", fontWeight: 700, color: "#1a1a2e", marginBottom: "8px", letterSpacing: "-0.2px" }}>Printer Not Connected</div>
        <div style={{ fontSize: "13px", color: "#888", lineHeight: 1.7, marginBottom: "24px" }}>Please connect the printer. Printing will resume automatically once connected.</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: "#F3EFFE", borderRadius: "12px", padding: "12px 20px", marginBottom: "20px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#7E49F2", animation: "pulse 1.2s ease-in-out infinite" }} />
          <span style={{ fontSize: "13px", color: "#7E49F2", fontWeight: 600 }}>Waiting for printer...</span>
        </div>
        <div style={{ height: "0.5px", background: "rgba(0,0,0,0.07)", marginBottom: "20px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "#FFF8EC", border: "1.5px solid #F2CB07", borderRadius: "16px", padding: "14px 16px", textAlign: "left" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#FFF0CC", border: "1.5px solid #EF9F27", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className="ti ti-headset" style={{ fontSize: "18px", color: "#854F0B" }} aria-hidden="true" />
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#633806", marginBottom: "2px" }}>Please contact support</div>
            <div style={{ fontSize: "11px", color: "#9a6c00", lineHeight: 1.5 }}>Show this screen to a staff member for assistance.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Centered Alert Modal ──────────────────────────────────────────────────────
function AlertModal({ alert }: { alert: AlertInfo }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(55,18,165,0.72)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "24px", animation: "fadeIn 0.22s ease" }}>
      <div style={{ background: "white", borderRadius: "28px", padding: "36px 30px 32px", maxWidth: "300px", width: "100%", textAlign: "center", boxShadow: "0 32px 80px rgba(0,0,0,0.22)", fontFamily: "'Sora', sans-serif", animation: "popIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both" }}>
        <div style={{ width: "76px", height: "76px", borderRadius: "50%", background: "#EEF0FE", border: "2px solid #7E49F2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
          <i className={`ti ${alert.icon}`} style={{ fontSize: "32px", color: "#7E49F2" }} aria-hidden="true" />
        </div>
        <div style={{ fontSize: "19px", fontWeight: 700, color: "#1a1a2e", marginBottom: "8px", letterSpacing: "-0.2px" }}>{alert.title}</div>
        <div style={{ fontSize: "13px", color: "#888", lineHeight: 1.7, marginBottom: "24px" }}>{alert.message}</div>
        <div style={{ height: "0.5px", background: "rgba(0,0,0,0.07)", marginBottom: "20px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "#FFF8EC", border: "1.5px solid #F2CB07", borderRadius: "16px", padding: "14px 16px", textAlign: "left" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#FFF0CC", border: "1.5px solid #EF9F27", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className="ti ti-headset" style={{ fontSize: "18px", color: "#854F0B" }} aria-hidden="true" />
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#633806", marginBottom: "2px" }}>Please contact support</div>
            <div style={{ fontSize: "11px", color: "#9a6c00", lineHeight: 1.5 }}>Show this screen to a staff member for assistance.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Error Modal ───────────────────────────────────────────────────────────────
function ErrorModal({ error, onDismiss, phase }: { error: ErrorInfo; onDismiss: () => void; phase: Phase }) {
  const ext = error.fileName ? getExt(error.fileName) : "";
  const extStyle = EXT_COLOR[ext] || { bg: "#7E49F218", border: "#7E49F255", text: "#4a2a99" };

  let iconClass = "ti-plug-connected-x";
  const r = (error.reason || error.message).toLowerCase();
  if (r.includes("paper") || r.includes("jam"))              iconClass = "ti-file-x";
  else if (r.includes("ink") || r.includes("cartridge"))     iconClass = "ti-droplet-off";
  else if (r.includes("timeout") || r.includes("timed out")) iconClass = "ti-clock-x";
  else if (r.includes("download") || r.includes("network"))  iconClass = "ti-wifi-off";
  else if (r.includes("qpdf") || r.includes("warning"))      iconClass = "ti-file-alert";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(55,18,165,0.72)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "24px", animation: "fadeIn 0.22s ease" }}>
      <div style={{ background: "white", borderRadius: "28px", padding: "36px 30px 28px", maxWidth: "320px", width: "100%", textAlign: "center", boxShadow: "0 32px 80px rgba(0,0,0,0.22)", fontFamily: "'Sora', sans-serif", animation: "popIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both" }}>
        <div style={{ width: "76px", height: "76px", borderRadius: "50%", background: "#FCEBEB", border: "2px solid #F09595", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
          <i className={`ti ${iconClass}`} style={{ fontSize: "32px", color: "#A32D2D" }} aria-hidden="true" />
        </div>
        <div style={{ fontSize: "19px", fontWeight: 700, color: "#1a1a2e", marginBottom: "8px" }}>Something went wrong</div>
        {error.fileName && (
          <div style={{ background: "#F7F7FA", border: "1px solid #E8E8F0", borderRadius: "14px", padding: "12px 16px", marginBottom: "14px", textAlign: "left" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <div style={{ background: extStyle.bg, border: `1.5px solid ${extStyle.border}`, borderRadius: "6px", padding: "2px 7px", fontSize: "9px", fontWeight: 800, color: extStyle.text, letterSpacing: "0.6px", textTransform: "uppercase", flexShrink: 0 }}>{ext || "FILE"}</div>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{error.fileName}</div>
            </div>
            {error.reason && <div style={{ fontSize: "12px", color: "#555", lineHeight: 1.55 }}><span style={{ fontWeight: 700, color: "#A32D2D" }}>{error.reason}</span></div>}
          </div>
        )}
        {!error.fileName && <div style={{ color: "#666", fontSize: "13px", lineHeight: 1.6, marginBottom: "14px" }}>{error.message}</div>}
        <div style={{ height: "0.5px", background: "rgba(0,0,0,0.07)", marginBottom: "20px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "#FFF8EC", border: "1.5px solid #F2CB07", borderRadius: "16px", padding: "14px 16px", textAlign: "left", marginBottom: phase !== "printing" ? "20px" : "0" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#FFF0CC", border: "1.5px solid #EF9F27", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className="ti ti-headset" style={{ fontSize: "18px", color: "#854F0B" }} aria-hidden="true" />
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#633806", marginBottom: "2px" }}>Please contact support</div>
            <div style={{ fontSize: "11px", color: "#9a6c00", lineHeight: 1.5 }}>Show this screen to a staff member for assistance.</div>
          </div>
        </div>
        {phase !== "printing" && (
          <button onClick={onDismiss} style={{ width: "100%", padding: "14px", background: "#7E49F2", border: "none", borderRadius: "14px", color: "white", fontWeight: 800, fontSize: "15px", cursor: "pointer", fontFamily: "'Sora', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
            <i className="ti ti-refresh" style={{ fontSize: "17px" }} aria-hidden="true" />
            Try Again
          </button>
        )}
      </div>
    </div>
  );
}

// ── Timeout Modal ─────────────────────────────────────────────────────────────
function TimeoutModal({ countdown }: { countdown: number }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(55,18,165,0.72)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: "24px", animation: "fadeIn 0.22s ease" }}>
      <div style={{ background: "white", borderRadius: "28px", padding: "36px 30px 32px", maxWidth: "300px", width: "100%", textAlign: "center", boxShadow: "0 32px 80px rgba(0,0,0,0.22)", fontFamily: "'Sora', sans-serif", animation: "popIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both" }}>
        <div style={{ width: "76px", height: "76px", borderRadius: "50%", background: "#FFF3E0", border: "2px solid #FF9800", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px", position: "relative" }}>
          <i className="ti ti-clock-x" style={{ fontSize: "32px", color: "#E65100" }} aria-hidden="true" />
          {/* countdown ring */}
          <svg style={{ position: "absolute", inset: "-4px", width: "84px", height: "84px" }} viewBox="0 0 84 84">
            <circle cx="42" cy="42" r="39" fill="none" stroke="#FFE0B2" strokeWidth="3" />
            <circle
              cx="42" cy="42" r="39"
              fill="none"
              stroke="#FF9800"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 39}`}
              strokeDashoffset={`${2 * Math.PI * 39 * (1 - countdown / 30)}`}
              transform="rotate(-90 42 42)"
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
        </div>
        <div style={{ fontSize: "19px", fontWeight: 700, color: "#1a1a2e", marginBottom: "8px", letterSpacing: "-0.2px" }}>Print Timed Out</div>
        <div style={{ fontSize: "13px", color: "#888", lineHeight: 1.7, marginBottom: "16px" }}>
          The printer is not responding. Returning to the previous screen in <strong style={{ color: "#E65100" }}>{countdown}s</strong>.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "#FFF8EC", border: "1.5px solid #F2CB07", borderRadius: "16px", padding: "14px 16px", textAlign: "left" }}>
          <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#FFF0CC", border: "1.5px solid #EF9F27", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <i className="ti ti-headset" style={{ fontSize: "18px", color: "#854F0B" }} aria-hidden="true" />
          </div>
          <div>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#633806", marginBottom: "2px" }}>Please contact support</div>
            <div style={{ fontSize: "11px", color: "#9a6c00", lineHeight: 1.5 }}>Show this screen to a staff member for assistance.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── File Row ──────────────────────────────────────────────────────────────────
function FileRow({ fp, phase, idx, fileData }: { fp: FileProgress; phase: Phase; idx: number; fileData: any }) {
  const ext      = getExt(fp.file_name);
  const extStyle = EXT_COLOR[ext] || { bg: "#7E49F218", border: "#7E49F255", text: "#4a2a99" };
  const status   = phase === "downloading" ? fp.download_status : fp.print_status;

  const statusLabel: Record<string, string> = { pending: "Waiting…", downloading: "Downloading…", printing: "Printing…", done: phase === "downloading" ? "Downloaded" : "Printed", failed: "Failed" };
  const statusColor: Record<string, string> = { pending: "rgba(0,0,0,0.25)", downloading: "#F2CB07", printing: "#F2CB07", done: "#16a34a", failed: "#ef4444" };

  const showPrintBar = phase === "printing" && fp.print_status === "printing" && fp.print_pct !== undefined;
  const pages  = fileData?.number_of_pages ?? "—";
  const copies = fileData?.copies ?? "—";
  const mode   = fileData?.printing_mode === "color" ? "Color" : "Mono";
  const side   = fileData?.printing_side === "double_side" ? "Double-sided" : "One-sided";
  const range  = fileData?.page_range?.length ? fileData.page_range.join(", ") : null;
  const layout = fileData?.page_layout === 2 ? "2-up" : null;

  return (
    <div style={{ animation: `slideUp 0.4s ease both`, animationDelay: `${idx * 0.07}s`, position: "relative" }}>
      <div style={{ position: "absolute", left: "-13px", top: "50%", transform: "translateY(-50%)", width: "26px", height: "26px", borderRadius: "50%", background: "#7E49F2", zIndex: 2, pointerEvents: "none" }} />
      <div style={{ position: "absolute", right: "-13px", top: "50%", transform: "translateY(-50%)", width: "26px", height: "26px", borderRadius: "50%", background: "#7E49F2", zIndex: 2, pointerEvents: "none" }} />
      <div style={{ background: "white", borderRadius: "18px", overflow: "hidden" }}>
        <div style={{ padding: "20px 26px 16px", borderBottom: "1.5px dashed rgba(126,73,242,0.20)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ background: extStyle.bg, border: `1.5px solid ${extStyle.border}`, borderRadius: "8px", padding: "4px 9px", fontSize: "10px", fontWeight: 800, color: extStyle.text, letterSpacing: "0.6px", textTransform: "uppercase", flexShrink: 0 }}>{ext || "FILE"}</div>
            <div style={{ flex: 1, fontWeight: 700, fontSize: "13px", color: "#1a1a2e", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fp.file_name}</div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: statusColor[status] || "#999", flexShrink: 0, display: "flex", alignItems: "center", gap: "5px" }}>
              {status === "done"       && <i className="ti ti-circle-check" style={{ fontSize: "15px", color: "#16a34a" }} aria-hidden="true" />}
              {status === "failed"     && <i className="ti ti-circle-x"     style={{ fontSize: "15px", color: "#ef4444" }} aria-hidden="true" />}
              {(status === "downloading" || status === "printing") && <span style={{ display: "inline-block", width: "7px", height: "7px", borderRadius: "50%", background: "#F2CB07", animation: "pulse 1s ease-in-out infinite" }} />}
              {statusLabel[status] || status}
            </div>
          </div>
        </div>

        <div style={{ padding: showPrintBar ? "12px 26px 8px" : "12px 26px 18px", display: "flex", gap: "14px", flexWrap: "wrap" }}>
          {[
            { icon: "ti-file-text",   val: `${pages} page${pages === 1 ? "" : "s"}` },
            { icon: "ti-copy",        val: `${copies} cop${copies === 1 ? "y" : "ies"}` },
            { icon: "ti-palette",     val: mode },
            { icon: "ti-layout-rows", val: side },
            ...(range  ? [{ icon: "ti-list-numbers", val: `Pages ${range}` }] : []),
            ...(layout ? [{ icon: "ti-layout-grid",  val: layout           }] : []),
          ].map(({ icon, val }) => (
            <div key={icon} style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "#888" }}>
              <i className={`ti ${icon}`} style={{ fontSize: "13px", color: "#bbb" }} aria-hidden="true" />
              {val}
            </div>
          ))}
        </div>

        {showPrintBar && (
          <div style={{ padding: "0 26px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
              <span style={{ fontSize: "10px", color: "#bbb", fontWeight: 600 }}>Sheet progress</span>
              <span style={{ fontSize: "10px", color: "#b89300", fontWeight: 700 }}>{fp.print_current ?? 0} / {fp.print_total ?? "?"} · {fp.print_pct}%</span>
            </div>
            <div style={{ height: "5px", borderRadius: "100px", background: "rgba(126,73,242,0.10)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${fp.print_pct}%`, background: "linear-gradient(90deg,#F2CB07,#f7d94a)", borderRadius: "100px", transition: "width 0.6s ease", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.45),transparent)", animation: "shimmer 1.8s ease-in-out infinite" }} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Bottom Progress Bar ───────────────────────────────────────────────────────
function BottomProgressBar({ phase, progressPct, downloadedCount, printedCount, total, printingFile }: { phase: Phase; progressPct: number; downloadedCount: number; printedCount: number; total: number; printingFile?: FileProgress }) {
  const remaining  = phase === "downloading" ? total - downloadedCount : total - printedCount;
  const isPrinting = phase === "printing";

  return (
    <div style={{ width: "100%", padding: "20px clamp(24px,4vw,56px) 40px", background: "linear-gradient(to top, rgba(30,10,100,1) 0%, rgba(30,10,100,0.95) 50%, transparent 100%)", flexShrink: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
        <div>
          <div style={{ color: "white", fontSize: "13px", fontWeight: 700, marginBottom: "2px" }}>{isPrinting ? "Print Progress" : "Download Progress"}</div>
          <div style={{ color: "rgba(255,255,255,0.40)", fontSize: "11px" }}>
            {isPrinting
              ? (printingFile?.print_pct !== undefined
                  ? `${printedCount} / ${total} files · current ${printingFile.print_pct}%`
                  : `${printedCount} / ${total} files printed`)
              : `${downloadedCount} / ${total} files downloaded`}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: "20px", padding: "5px 13px" }}>
          <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: isPrinting ? "#F2CB07" : "white", animation: "pulse 1.2s ease-in-out infinite" }} />
          <span style={{ color: isPrinting ? "#F2CB07" : "white", fontSize: "11px", fontWeight: 700 }}>{remaining} remaining</span>
        </div>
      </div>
      <div style={{ position: "relative", height: "10px", borderRadius: "100px", background: "rgba(255,255,255,0.10)", overflow: "hidden", marginBottom: "10px" }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${progressPct}%`, background: isPrinting ? "linear-gradient(90deg,#F2CB07,#f7d94a)" : "linear-gradient(90deg,rgba(255,255,255,0.85),white)", borderRadius: "100px", transition: "width 0.7s cubic-bezier(0.4,0,0.2,1)", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.50),transparent)", animation: "shimmer 2s ease-in-out infinite" }} />
        </div>
        {[25, 50, 75].map((tick) => (
          <div key={tick} style={{ position: "absolute", left: `${tick}%`, top: "50%", transform: "translate(-50%,-50%)", width: "1px", height: "6px", background: progressPct >= tick ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.10)", borderRadius: "1px" }} />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, color: isPrinting ? "#F2CB07" : "rgba(255,255,255,0.7)", minWidth: "36px", transition: "color 0.4s" }}>{Math.round(progressPct)}%</span>
        <div style={{ flex: 1, display: "flex", gap: "6px", alignItems: "center" }}>
          {[0, 25, 50, 75, 100].map((milestone) => {
            const reached = progressPct >= milestone;
            return (
              <div key={milestone} style={{ flex: milestone === 0 || milestone === 100 ? "0 0 auto" : 1, display: "flex", flexDirection: "column", alignItems: milestone === 0 ? "flex-start" : milestone === 100 ? "flex-end" : "center" }}>
                <div style={{ width: reached ? "8px" : "5px", height: reached ? "8px" : "5px", borderRadius: "50%", background: reached ? (isPrinting ? "#F2CB07" : "white") : "rgba(255,255,255,0.18)", transition: "all 0.4s ease", boxShadow: reached ? (isPrinting ? "0 0 8px rgba(242,203,7,0.6)" : "0 0 8px rgba(255,255,255,0.5)") : "none" }} />
                {(milestone === 0 || milestone === 50 || milestone === 100) && (
                  <div style={{ fontSize: "9px", color: reached ? "rgba(255,255,255,0.50)" : "rgba(255,255,255,0.20)", marginTop: "4px", fontWeight: 600, transition: "color 0.4s" }}>
                    {milestone === 0 ? "Start" : milestone === 50 ? "Half" : "Done"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LoadingPage() {
  const navigate = useNavigate();
  const job   = getJob();
  const files = job?.files ?? [];

  const [phase, setPhase]               = useState<Phase>("downloading");
  const [fileProgress, setFileProgress] = useState<FileProgress[]>(
    files.map((f: any) => ({ file_id: f.file_id, file_name: f.file_name, download_status: "pending", print_status: "pending" }))
  );
  const [errorInfo, setErrorInfo]                     = useState<ErrorInfo | null>(null);
  const [printerAlert, setPrinterAlert]               = useState<AlertInfo | null>(null);
  const [printerDisconnected, setPrinterDisconnected] = useState(false);
  const [overallMessage, setOverallMessage]           = useState("Preparing your documents…");

  // ── Timeout state ──────────────────────────────────────────────────────────
  const [printTimedOut, setPrintTimedOut]       = useState(false);
  const [timeoutCountdown, setTimeoutCountdown] = useState(30);
  const printTimeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const navigatedRef     = useRef(false);

  useAlertSound(printerAlert !== null || printerDisconnected);

  const currentFileIdRef   = useRef<string | null>(null);
  const paperEmptyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Start / reset the 30-second print watchdog ────────────────────────────
  function startPrintTimeout() {
    clearPrintTimeout();
    printTimeoutRef.current = setTimeout(() => {
      // Show the timeout modal and start countdown
      setPrintTimedOut(true);
      let remaining = 30;
      setTimeoutCountdown(remaining);
      countdownRef.current = setInterval(() => {
        remaining -= 1;
        setTimeoutCountdown(remaining);
        if (remaining <= 0) {
          clearPrintTimeout();
          if (!navigatedRef.current) {
            navigatedRef.current = true;
            navigate(-1);
          }
        }
      }, 1000);
    }, PRINT_TIMEOUT_MS);
  }

  function clearPrintTimeout() {
    if (printTimeoutRef.current) { clearTimeout(printTimeoutRef.current);  printTimeoutRef.current  = null; }
    if (countdownRef.current)    { clearInterval(countdownRef.current);     countdownRef.current     = null; }
  }

  function resetPrintTimeout() {
    // Called whenever we get a progress event — the print is alive, so reset the watchdog
    setPrintTimedOut(false);
    setTimeoutCountdown(30);
    startPrintTimeout();
  }

  function updateFile(file_id: string, patch: Partial<FileProgress>) {
    setFileProgress((prev) => prev.map((fp) => (fp.file_id === file_id ? { ...fp, ...patch } : fp)));
  }

  async function downloadFile(file: any): Promise<string> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        updateFile(file.file_id, { download_status: "downloading" });
        const path: string = await invoke("download_pdf_url_commands", { url: file.download_url, fileName: file.file_name });
        updateFile(file.file_id, { download_status: "done", local_path: path });
        return path;
      } catch (err) {
        if (attempt === MAX_RETRIES) {
          updateFile(file.file_id, { download_status: "failed" });
          throw new Error(`Failed to download "${file.file_name}" after ${MAX_RETRIES + 1} attempts.`);
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    throw new Error("unreachable");
  }

  async function printFile(file: any, localPath: string) {
    currentFileIdRef.current = file.file_id;

    const sheets = computeSheets(file);

    updateFile(file.file_id, {
      print_status:  "printing",
      print_pct:     0,
      print_current: 0,
      print_total:   sheets,
    });

    // Start the 30-second watchdog as soon as we begin printing
    startPrintTimeout();

    while (true) {
      try {
        await invoke("print_pdf_command", {
          pdfPath:       localPath,
          fileName:      file.file_name,
          pages:         file.number_of_pages ?? sheets,  // total doc pages, not computed sheets — Rust uses this for is_full_range check
          copies:        file.copies ?? 1,
          colorMode:     file.printing_mode === "color" ? "Color" : "Monochrome",
          duplex:        file.printing_side === "double_side",
          pageRange:     joinPageRange(file.page_range),
          pagesPerSheet: file.page_layout === 2 ? "2" : null,
          sessionId:     job?.session_id,
        });

        // ── Print succeeded ────────────────────────────────────────────────
        clearPrintTimeout();
        setPrintTimedOut(false);
        setPrinterDisconnected(false);
        updateFile(file.file_id, {
          print_status:  "done",
          print_pct:     100,
          print_current: sheets,
        });
        break;

      } catch (err: any) {
        const msg = (err?.message || String(err)).toLowerCase();

        // ── Timeout / qpdf hang: navigate back immediately ─────────────────
        if (
          msg.includes("timeout")       ||
          msg.includes("timed out")     ||
          msg.includes("qpdf")          ||
          msg.includes("operation timed")
        ) {
          clearPrintTimeout();
          updateFile(file.file_id, { print_status: "failed" });
          currentFileIdRef.current = null;
          // Show timeout modal which will count down and navigate back
          setPrintTimedOut(true);
          let remaining = 30;
          setTimeoutCountdown(remaining);
          countdownRef.current = setInterval(() => {
            remaining -= 1;
            setTimeoutCountdown(remaining);
            if (remaining <= 0) {
              clearPrintTimeout();
              if (!navigatedRef.current) {
                navigatedRef.current = true;
                navigate(-1);
              }
            }
          }, 1000);
          return;
        }

        // ── Printer disconnected: poll until back ──────────────────────────
        if (
          msg.includes("not connected")           ||
          msg.includes("disconnected")            ||
          msg.includes("not found")               ||
          msg.includes("canon printer not found") ||
          (msg.includes("please contact staff") && msg.includes("connect"))
        ) {
          clearPrintTimeout(); // pause watchdog while disconnected
          setPrinterDisconnected(true);

          while (true) {
            await new Promise((r) => setTimeout(r, 3000));
            try {
              await invoke("check_printer_ready_command");
              setPrinterDisconnected(false);
              startPrintTimeout(); // restart watchdog when printer is back
              break;
            } catch {
              // still not ready
            }
          }

          continue; // retry print_pdf_command
        }

        // ── Any other error ────────────────────────────────────────────────
        clearPrintTimeout();
        setPrinterDisconnected(false);
        updateFile(file.file_id, { print_status: "failed" });
        currentFileIdRef.current = null;
        throw new Error(`Failed to print "${file.file_name}": ${err}`);
      }
    }

    currentFileIdRef.current = null;
  }

  const hasStarted = useRef(false);

  useEffect(() => {
    if (!files.length) return;
    if (hasStarted.current) return;
    hasStarted.current = true;

    async function run() {
      setOverallMessage("Downloading your documents…");
      const localPaths: { file: any; path: string }[] = [];
      for (const file of files) {
        try {
          const path = await downloadFile(file);
          localPaths.push({ file, path });
        } catch (err: any) {
          setErrorInfo(parseError(err?.message || `Could not download "${file.file_name}". Please contact support.`));
          return;
        }
      }
      setPhase("printing");
      setOverallMessage("Sending to printer…");
      for (const { file, path } of localPaths) {
        try {
          await printFile(file, path);
        } catch (err: any) {
          setErrorInfo(parseError(err?.message || "A print error occurred. Please contact support."));
          return;
        }
      }
      setPhase("done");
      setOverallMessage("All done!");
      setTimeout(() => navigate("/done"), 1200);
    }

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unlisten: (() => void)[] = [];

    listen<{ current: number; total: number; pct: number }>("printer:page_progress", ({ payload }) => {
      const id = currentFileIdRef.current;
      if (!id) return;
      // Got a progress event → printer is alive → reset the watchdog
      resetPrintTimeout();
      setFileProgress((prev) =>
        prev.map((fp) =>
          fp.file_id === id
            ? { ...fp, print_pct: payload.pct, print_current: payload.current, print_total: payload.total }
            : fp
        )
      );
    }).then((fn) => unlisten.push(fn));

    listen("printer:paper_empty", () => {
      setPrinterAlert({ icon: "ti-file-x", title: "Paper tray is empty", message: "Please refill the paper tray to continue printing." });
      if (paperEmptyTimerRef.current) clearTimeout(paperEmptyTimerRef.current);
      paperEmptyTimerRef.current = setTimeout(() => {
        setPrinterAlert({ icon: "ti-clock-x", title: "Waiting too long", message: "Paper tray has been empty for too long. Please contact staff." });
        paperEmptyTimerRef.current = null;
      }, 5 * 60 * 1000);
    }).then((fn) => unlisten.push(fn));

    const bannerEvents: [string, string, string, string][] = [
      ["printer:paper_jam", "ti-alert-triangle", "Paper jam detected",  "Please clear the jam and printing will resume."],
      ["printer:ink_empty", "ti-droplet-off",    "Ink cartridge empty", "Please replace the cartridge to continue."],
      ["printer:ink_low",   "ti-droplet-half-2", "Ink level is low",    "Printing continues — please replace the cartridge soon."],
    ];
    bannerEvents.forEach(([event, icon, title, message]) => {
      listen(event, () => setPrinterAlert({ icon, title, message })).then((fn) => unlisten.push(fn));
    });

    const clearedEvents = ["printer:paper_refilled", "printer:jam_cleared", "printer:ink_replaced"];
    clearedEvents.forEach((event) => {
      listen(event, () => {
        if (paperEmptyTimerRef.current) { clearTimeout(paperEmptyTimerRef.current); paperEmptyTimerRef.current = null; }
        setPrinterAlert(null);
      }).then((fn) => unlisten.push(fn));
    });

    listen("printer:timeout", () => {
      // Backend explicitly says timeout → show timeout modal
      clearPrintTimeout();
      setPrinterAlert(null);
      setPrintTimedOut(true);
      let remaining = 30;
      setTimeoutCountdown(remaining);
      countdownRef.current = setInterval(() => {
        remaining -= 1;
        setTimeoutCountdown(remaining);
        if (remaining <= 0) {
          clearPrintTimeout();
          if (!navigatedRef.current) {
            navigatedRef.current = true;
            navigate(-1);
          }
        }
      }, 1000);
    }).then((fn) => unlisten.push(fn));

    listen("printer:disconnected", () => {
      clearPrintTimeout(); // pause watchdog while disconnected
      setPrinterDisconnected(true);
    }).then((fn) => unlisten.push(fn));

    listen<string>("printer:failed", ({ payload }) => {
      clearPrintTimeout();
      setPrinterAlert(null);
      setPrinterDisconnected(false);
      setErrorInfo(parseError(payload || "A printer error occurred. Please contact staff."));
    }).then((fn) => unlisten.push(fn));

    return () => {
      unlisten.forEach((fn) => fn());
      if (paperEmptyTimerRef.current) clearTimeout(paperEmptyTimerRef.current);
      clearPrintTimeout();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Progress calculation ───────────────────────────────────────────────────
  const downloadedCount = fileProgress.filter((fp) => fp.download_status === "done").length;
  const printedCount    = fileProgress.filter((fp) => fp.print_status === "done").length;
  const total           = fileProgress.length;
  const printingFile    = fileProgress.find((fp) => fp.print_status === "printing");
  const activeFilePct   = printingFile?.print_pct ?? 0;

  const progressPct =
    phase === "downloading" ? (downloadedCount / (total || 1)) * 100
    : total === 0 ? 0
    : ((printedCount * 100) + activeFilePct) / total;

  const phaseLabel = phase === "downloading" ? "Downloading" : phase === "printing" ? "Printing" : "Complete";

  const fileMap: Record<string, any> = {};
  for (const f of files) fileMap[f.file_id] = f;

  return (
    <div style={{ width: "100vw", height: "100vh", backgroundColor: "#7E49F2", fontFamily: "'Sora', sans-serif", display: "flex", flexDirection: "column", alignItems: "center", overflow: "hidden", position: "relative", boxSizing: "border-box" }}>
      <div style={{ position: "absolute", top: "-110px", right: "-110px", width: "380px", height: "380px", borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "-60px", left: "-80px", width: "300px", height: "300px", borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />

      {/* Spinner */}
      <div style={{ position: "relative", width: "150px", height: "150px", marginTop: "clamp(32px,5vh,56px)", marginBottom: "24px", flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2.5px solid rgba(255,255,255,0.08)", borderTopColor: "rgba(255,255,255,0.30)", animation: "spin 3s linear infinite" }} />
        <div style={{ position: "absolute", inset: "16px", borderRadius: "50%", border: "2.5px solid rgba(255,255,255,0.08)", borderTopColor: "rgba(255,255,255,0.55)", borderRightColor: "rgba(255,255,255,0.18)", animation: "spinR 2s linear infinite" }} />
        <div style={{ position: "absolute", inset: "32px", borderRadius: "50%", border: "2.5px solid rgba(255,255,255,0.06)", borderTopColor: "white", borderRightColor: "rgba(255,255,255,0.35)", animation: "spin 1.2s linear infinite" }} />
        <div style={{ position: "absolute", inset: "46px", borderRadius: "50%", background: "rgba(255,255,255,0.13)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid rgba(255,255,255,0.22)" }}>
          <i className={phase === "printing" ? "ti ti-printer" : "ti ti-cloud-download"} style={{ fontSize: "20px", color: "white", opacity: 0.95 }} aria-hidden="true" />
        </div>
        <div style={{ position: "absolute", inset: 0, animation: "spin 2s linear infinite" }}>
          <div style={{ position: "absolute", top: "5px", left: "50%", transform: "translateX(-50%)", width: "11px", height: "11px", borderRadius: "50%", background: phase === "printing" ? "#F2CB07" : "white", boxShadow: `0 0 14px ${phase === "printing" ? "rgba(242,203,7,0.9)" : "rgba(255,255,255,0.8)"}`, transition: "background 0.4s", animation: "blink 1.2s ease-in-out infinite" }} />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: phase === "printing" ? "#F2CB07" : "white", animation: "pulse 1.2s ease-in-out infinite", transition: "background 0.4s" }} />
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "1.3px", textTransform: "uppercase" as const, color: phase === "printing" ? "#F2CB07" : "rgba(255,255,255,0.75)", transition: "color 0.4s" }}>{phaseLabel}</div>
      </div>

      <div style={{ color: "white", fontWeight: 700, fontSize: "clamp(15px,2vw,19px)", letterSpacing: "-0.2px", textAlign: "center", marginBottom: "3px", padding: "0 24px" }}>{overallMessage}</div>
      <div style={{ color: "rgba(255,255,255,0.48)", fontSize: "12px", fontWeight: 500, textAlign: "center", marginBottom: "22px" }}>
        {phase === "downloading"
          ? `${downloadedCount} / ${total} files downloaded`
          : printingFile?.print_pct !== undefined
            ? `${printedCount} / ${total} files · current: ${printingFile.print_pct}%`
            : `${printedCount} / ${total} files printed`}
      </div>

      <div style={{ flex: 1, overflowY: "auto", width: "100%", padding: "0 clamp(22px,4vw,48px) 12px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "10px" }}>
        {fileProgress.map((fp, idx) => (
          <FileRow key={fp.file_id} fp={fp} phase={phase} idx={idx} fileData={fileMap[fp.file_id]} />
        ))}
      </div>

      <BottomProgressBar phase={phase} progressPct={progressPct} downloadedCount={downloadedCount} printedCount={printedCount} total={total} printingFile={printingFile} />

      {/* Modal priority: timeout > disconnected > alert > error */}
      {printTimedOut && <TimeoutModal countdown={timeoutCountdown} />}
      {!printTimedOut && printerDisconnected && <PrinterDisconnectedModal />}
      {!printTimedOut && !printerDisconnected && printerAlert && <AlertModal alert={printerAlert} />}
      {!printTimedOut && !printerDisconnected && !printerAlert && errorInfo && (
        <ErrorModal error={errorInfo} phase={phase} onDismiss={() => { setErrorInfo(null); navigate(-1); }} />
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap');
        @import url('https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css');
        @keyframes spin    { from { transform: rotate(0deg);   } to { transform: rotate(360deg);  } }
        @keyframes spinR   { from { transform: rotate(360deg); } to { transform: rotate(0deg);    } }
        @keyframes pulse   { 0%,100% { transform:scale(1);opacity:1; } 50% { transform:scale(1.45);opacity:.6; } }
        @keyframes blink   { 0%,100% { opacity:1; } 50% { opacity:.3; } }
        @keyframes slideUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn  { from { opacity:0; } to { opacity:1; } }
        @keyframes shimmer { 0% { transform:translateX(-100%); } 100% { transform:translateX(200%); } }
        @keyframes popIn   { from { opacity:0; transform:scale(0.88); } to { opacity:1; transform:scale(1); } }
        ::-webkit-scrollbar { width: 0; }
      `}</style>
    </div>
  );
}