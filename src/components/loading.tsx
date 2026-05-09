import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getJob } from "../store/jobStore";

// ── Constants ────────────────────────────────────────────────────────────────
const MAX_RETRIES = 2; // total attempts = 1 + MAX_RETRIES

// ── Types ────────────────────────────────────────────────────────────────────
type Phase = "downloading" | "printing" | "done";

interface FileProgress {
  file_id: string;
  file_name: string;
  download_status: "pending" | "downloading" | "done" | "failed";
  print_status: "pending" | "printing" | "done" | "failed";
  local_path?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getExt(name: string) {
  return name.split(".").pop()?.toLowerCase() || "";
}

const EXT_COLOR: Record<string, string> = {
  pdf: "#F2CB07",
  docx: "#F2CB07",
  pptx: "#F2CB07",
  xlsx: "#18a06b",
};

// ── Contact Support Modal ────────────────────────────────────────────────────
function SupportModal({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "24px",
        animation: "fadeIn 0.25s ease",
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: "24px",
          padding: "36px 32px 28px",
          maxWidth: "380px",
          width: "100%",
          boxShadow: "0 24px 80px rgba(0,0,0,0.30)",
          textAlign: "center",
          fontFamily: "'Sora', sans-serif",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: "72px",
            height: "72px",
            borderRadius: "50%",
            background: "#FFF0F0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            fontSize: "32px",
          }}
        >
          ⚠️
        </div>

        <div
          style={{
            fontWeight: 800,
            fontSize: "18px",
            color: "#1a1a2e",
            marginBottom: "10px",
          }}
        >
          Something went wrong
        </div>

        <div
          style={{
            color: "#666",
            fontSize: "14px",
            lineHeight: 1.6,
            marginBottom: "28px",
          }}
        >
          {message}
        </div>

        {/* Contact Support badge */}
        <div
          style={{
            background: "#FFF5E0",
            border: "1.5px solid #F2CB07",
            borderRadius: "14px",
            padding: "14px 20px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{ fontWeight: 700, fontSize: "13px", color: "#b07d00", marginBottom: "4px" }}
          >
            Please contact support
          </div>
          <div style={{ fontSize: "12px", color: "#9a6c00" }}>
            Show this screen to a staff member for assistance.
          </div>
        </div>

        <button
          onClick={onDismiss}
          style={{
            width: "100%",
            padding: "14px",
            background: "#7E49F2",
            border: "none",
            borderRadius: "14px",
            color: "white",
            fontWeight: 800,
            fontSize: "15px",
            cursor: "pointer",
            fontFamily: "'Sora', sans-serif",
          }}
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

// ── File row ─────────────────────────────────────────────────────────────────
function FileRow({
  fp,
  phase,
  idx,
}: {
  fp: FileProgress;
  phase: Phase;
  idx: number;
}) {
  const ext = getExt(fp.file_name);
  const color = EXT_COLOR[ext] || "#7E49F2";

  const status =
    phase === "downloading"
      ? fp.download_status
      : fp.print_status;

  const statusLabel: Record<string, string> = {
    pending: "Waiting…",
    downloading: "Downloading…",
    printing: "Printing…",
    done: phase === "downloading" ? "Downloaded" : "Printed ✓",
    failed: "Failed",
  };

  const statusColor: Record<string, string> = {
    pending: "rgba(255,255,255,0.40)",
    downloading: "#F2CB07",
    printing: "#F2CB07",
    done: "#4ade80",
    failed: "#f87171",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        background: "rgba(255,255,255,0.08)",
        borderRadius: "16px",
        padding: "14px 18px",
        animation: `slideUp 0.4s ease both`,
        animationDelay: `${idx * 0.07}s`,
        border: "1px solid rgba(255,255,255,0.10)",
      }}
    >
      {/* Ext badge */}
      <div
        style={{
          background: `${color}20`,
          border: `1.5px solid ${color}50`,
          borderRadius: "8px",
          padding: "4px 9px",
          fontSize: "10px",
          fontWeight: 800,
          color: color,
          letterSpacing: "0.6px",
          textTransform: "uppercase",
          flexShrink: 0,
        }}
      >
        {ext}
      </div>

      {/* Name */}
      <div
        style={{
          flex: 1,
          fontWeight: 600,
          fontSize: "13px",
          color: "white",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {fp.file_name}
      </div>

      {/* Status */}
      <div
        style={{
          fontSize: "12px",
          fontWeight: 700,
          color: statusColor[status] || "white",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        {(status === "downloading" || status === "printing") && (
          <span
            style={{
              display: "inline-block",
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#F2CB07",
              animation: "pulse 1s ease-in-out infinite",
            }}
          />
        )}
        {statusLabel[status] || status}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LoadingPage() {
  const navigate = useNavigate();
  const job = getJob();
  const files = job?.files ?? [];

  const [phase, setPhase] = useState<Phase>("downloading");
  const [fileProgress, setFileProgress] = useState<FileProgress[]>(
    files.map((f: any) => ({
      file_id: f.file_id,
      file_name: f.file_name,
      download_status: "pending",
      print_status: "pending",
    }))
  );
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [overallMessage, setOverallMessage] = useState("Preparing your documents…");
  const [printerAlert, setPrinterAlert] = useState<{ icon: string; message: string } | null>(null);

  // Keep a ref to fileProgress so event listeners can read latest state
  const progressRef = useRef(fileProgress);
  progressRef.current = fileProgress;

  // ── Helpers ────────────────────────────────────────────────────────────────
  function updateDownload(file_id: string, patch: Partial<FileProgress>) {
    setFileProgress((prev) =>
      prev.map((fp) => (fp.file_id === file_id ? { ...fp, ...patch } : fp))
    );
  }

  function updatePrint(file_id: string, patch: Partial<FileProgress>) {
    setFileProgress((prev) =>
      prev.map((fp) => (fp.file_id === file_id ? { ...fp, ...patch } : fp))
    );
  }

  // ── Download one file with retry ──────────────────────────────────────────
  async function downloadFile(file: any): Promise<string> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        updateDownload(file.file_id, { download_status: "downloading" });
        const path: string = await invoke("download_pdf_url_commands", {
          url: file.download_url,
          fileName: file.file_name,
        });
        updateDownload(file.file_id, { download_status: "done", local_path: path });
        return path;
      } catch (err) {
        console.error(
          `Download attempt ${attempt + 1} failed for ${file.file_name}:`,
          err
        );
        if (attempt === MAX_RETRIES) {
          updateDownload(file.file_id, { download_status: "failed" });
          throw new Error(
            `Failed to download "${file.file_name}" after ${MAX_RETRIES + 1} attempts.`
          );
        }
        // brief pause before retry
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    throw new Error("unreachable");
  }

  // ── Print one file (sequential — never called concurrently) ─────────────
  async function printFile(file: any, localPath: string) {
    updatePrint(file.file_id, { print_status: "printing" });
    try {
      await invoke("print_pdf_command", {
        pdfPath:    localPath,
        fileName:   file.file_name,
        pages:      file.number_of_pages ?? 1,
        copies:     file.copies ?? 1,
        colorMode:  file.printing_mode ?? "monochromatic",  // "monochromatic" | "color"
        duplex:     file.printing_side === "double_side",   // true = two-sided
      });
      updatePrint(file.file_id, { print_status: "done" });
    } catch (err) {
      updatePrint(file.file_id, { print_status: "failed" });
      throw new Error(`Failed to print "${file.file_name}": ${err}`);
    }
  }

  // ── Main flow ─────────────────────────────────────────────────────────────
  // Guard against React StrictMode double-invoking useEffect in development
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!files.length) return;
    if (hasStarted.current) return;   // ← prevent second invocation
    hasStarted.current = true;

    async function run() {
      // ── Phase 1: Download all ──────────────────────────────────────────────
      setOverallMessage("Downloading your documents…");
      const localPaths: { file: any; path: string }[] = [];

      for (const file of files) {
        try {
          const path = await downloadFile(file);
          localPaths.push({ file, path });
        } catch (err: any) {
          setErrorModal(
            err?.message ||
              `Could not download "${file.file_name}". Please contact support.`
          );
          return; // stop — user must tap "Try Again"
        }
      }

      // ── Phase 2: Print all ────────────────────────────────────────────────
      setPhase("printing");
      setOverallMessage("Sending to printer…");

      for (const { file, path } of localPaths) {
        try {
          await printFile(file, path);
        } catch (err: any) {
          setErrorModal(
            err?.message ||
              `A print error occurred. Please contact support.`
          );
          return;
        }
      }

      // ── Done ──────────────────────────────────────────────────────────────
      setPhase("done");
      setOverallMessage("All done! ✓");
      setTimeout(() => navigate("/done"), 1200);
    }

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Listen to Tauri printer events ───────────────────────────────────────
  useEffect(() => {
    const unlisten: (() => void)[] = [];

    // Non-fatal: show a banner, printing is paused but will auto-resume
    const bannerEvents: [string, string, string][] = [
      ["printer:paper_empty",  "📭", "Paper tray empty — please refill the paper."],
      ["printer:paper_jam",    "🚨", "Paper jam detected — please clear the jam."],
      ["printer:ink_empty",    "🖊️", "Ink cartridge empty — please replace it."],
      ["printer:ink_low",      "⚠️", "Ink level is low. Printing continues."],
    ];

    // Cleared: dismiss the banner
    const clearedEvents = [
      "printer:paper_refilled",
      "printer:jam_cleared",
      "printer:ink_replaced",
    ];

    // Fatal: show the contact-support modal
    const fatalEvents: [string, string][] = [
      ["printer:disconnected", "Printer was disconnected. Please contact staff."],
      ["printer:timeout",      "Print job timed out. Please contact staff."],
      ["printer:failed",       "A printer error occurred. Please contact staff."],
    ];

    bannerEvents.forEach(([event, icon, message]) => {
      listen(event, () => {
        setPrinterAlert({ icon, message });
      }).then((fn) => unlisten.push(fn));
    });

    clearedEvents.forEach((event) => {
      listen(event, () => {
        setPrinterAlert(null);
      }).then((fn) => unlisten.push(fn));
    });

    fatalEvents.forEach(([event, msg]) => {
      listen(event, () => {
        setPrinterAlert(null);
        setErrorModal(msg);
      }).then((fn) => unlisten.push(fn));
    });

    return () => unlisten.forEach((fn) => fn());
  }, []);

  // ── Computed progress for display ─────────────────────────────────────────
  const downloadedCount = fileProgress.filter(
    (fp) => fp.download_status === "done"
  ).length;
  const printedCount = fileProgress.filter(
    (fp) => fp.print_status === "done"
  ).length;
  const total = fileProgress.length;

  const progressPct =
    phase === "downloading"
      ? (downloadedCount / total) * 100
      : (printedCount / total) * 100;

  const SEGMENTS = 5;
  const filledSegments = Math.floor((progressPct / 100) * SEGMENTS);
  const partialFill = ((progressPct / 100) * SEGMENTS) % 1;

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        backgroundColor: "#7E49F2",
        fontFamily: "'Sora', sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflow: "hidden",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      {/* BG circles */}
      <div style={{ position: "absolute", top: "-110px", right: "-110px", width: "380px", height: "380px", borderRadius: "50%", background: "rgba(255,255,255,0.06)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "-60px", left: "-80px", width: "300px", height: "300px", borderRadius: "50%", background: "rgba(255,255,255,0.04)", pointerEvents: "none" }} />

      {/* ── SPINNER ── */}
      <div style={{ position: "relative", width: "160px", height: "160px", marginTop: "clamp(36px,6vh,64px)", marginBottom: "28px", flexShrink: 0 }}>
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.10)", borderTopColor: "rgba(255,255,255,0.35)", animation: "spin 3s linear infinite" }} />
        <div style={{ position: "absolute", inset: "16px", borderRadius: "50%", border: "3px solid rgba(255,255,255,0.10)", borderTopColor: "rgba(255,255,255,0.60)", borderRightColor: "rgba(255,255,255,0.20)", animation: "spin 2s linear infinite reverse" }} />
        <div style={{ position: "absolute", inset: "32px", borderRadius: "50%", border: "3px solid rgba(255,255,255,0.08)", borderTopColor: "white", borderRightColor: "rgba(255,255,255,0.40)", animation: "spin 1.2s linear infinite" }} />
        <div style={{ position: "absolute", inset: "48px", borderRadius: "50%", background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid rgba(255,255,255,0.20)" }}>
          <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "white", boxShadow: "0 0 12px rgba(255,255,255,0.8)", animation: "pulse 1.5s ease-in-out infinite" }} />
        </div>
        <div style={{ position: "absolute", inset: 0, animation: "spin 2s linear infinite" }}>
          <div style={{ position: "absolute", top: "6px", left: "50%", transform: "translateX(-50%)", width: "12px", height: "12px", borderRadius: "50%", background: phase === "printing" ? "#F2CB07" : "white", boxShadow: `0 0 14px ${phase === "printing" ? "rgba(242,203,7,0.9)" : "rgba(255,255,255,0.8)"}`, transition: "background 0.4s" }} />
        </div>
      </div>

      {/* Phase label */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: phase === "printing" ? "#F2CB07" : "white", animation: "pulse 1.2s ease-in-out infinite", transition: "background 0.4s" }} />
        <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase" as const, color: phase === "printing" ? "#F2CB07" : "rgba(255,255,255,0.75)", transition: "color 0.4s" }}>
          {phase === "downloading" ? "Downloading" : phase === "printing" ? "Printing" : "Complete"}
        </div>
      </div>

      {/* Overall message */}
      <div style={{ color: "white", fontWeight: 700, fontSize: "clamp(15px,2vw,19px)", letterSpacing: "-0.2px", textAlign: "center", marginBottom: "4px", padding: "0 24px" }}>
        {overallMessage}
      </div>
      <div style={{ color: "rgba(255,255,255,0.50)", fontSize: "13px", fontWeight: 500, textAlign: "center", marginBottom: "24px" }}>
        {phase === "downloading"
          ? `${downloadedCount} / ${total} files downloaded`
          : `${printedCount} / ${total} files printed`}
      </div>

      {/* ── File list ── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          width: "100%",
          padding: "0 clamp(20px,3vw,44px) 160px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        {fileProgress.map((fp, idx) => (
          <FileRow key={fp.file_id} fp={fp} phase={phase} idx={idx} />
        ))}
      </div>

      {/* ── Progress bar (bottom) ── */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "20px clamp(24px,4vw,56px) 36px",
          background: "linear-gradient(to top, rgba(60,20,170,1) 0%, rgba(60,20,170,0.9) 55%, transparent 100%)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "12px" }}>
          <div>
            <div style={{ color: "white", fontSize: "14px", fontWeight: 700 }}>
              {phase === "downloading" ? "Download Progress" : "Print Progress"}
            </div>
            <div style={{ color: "rgba(255,255,255,0.50)", fontSize: "12px", marginTop: "2px" }}>
              {Math.round(progressPct)}% complete
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.20)", borderRadius: "20px", padding: "4px 12px", color: "#F2CB07", fontSize: "12px", fontWeight: 700 }}>
            {phase === "downloading"
              ? `${total - downloadedCount} remaining`
              : `${total - printedCount} remaining`}
          </div>
        </div>

        {/* Segmented bar */}
        <div style={{ display: "flex", gap: "6px" }}>
          {Array.from({ length: SEGMENTS }).map((_, i) => {
            const isFull = i < filledSegments;
            const isPartial = i === filledSegments && partialFill > 0;
            return (
              <div key={i} style={{ flex: 1, height: "10px", borderRadius: "100px", background: "rgba(255,255,255,0.12)", overflow: "hidden", position: "relative", boxShadow: isPartial ? "0 0 0 1px rgba(242,203,7,0.4)" : "none" }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: isFull ? "100%" : isPartial ? `${partialFill * 100}%` : "0%", background: "linear-gradient(90deg, #F2CB07, #f7d94a)", borderRadius: "100px", transition: "width 0.6s ease", boxShadow: (isFull || isPartial) ? "0 0 8px rgba(242,203,7,0.6)" : "none" }}>
                  {(isFull || isPartial) && (
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)", animation: "shimmer 1.8s ease-in-out infinite" }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
          {Array.from({ length: SEGMENTS }).map((_, i) => (
            <div key={i} style={{ flex: 1, display: "flex", justifyContent: "center" }}>
              <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: i < filledSegments ? "#F2CB07" : i === filledSegments ? "rgba(242,203,7,0.5)" : "rgba(255,255,255,0.18)", transition: "background 0.4s" }} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Printer Alert Banner (paper empty, jam, ink) ── */}
      {printerAlert && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(242, 203, 7, 0.15)",
            border: "1.5px solid rgba(242, 203, 7, 0.60)",
            borderRadius: "16px",
            padding: "14px 22px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            zIndex: 999,
            backdropFilter: "blur(10px)",
            maxWidth: "90vw",
            animation: "slideDown 0.3s ease",
          }}
        >
          <span style={{ fontSize: "22px" }}>{printerAlert.icon}</span>
          <div>
            <div style={{ color: "#F2CB07", fontWeight: 700, fontSize: "13px" }}>
              Printer needs attention
            </div>
            <div style={{ color: "rgba(255,255,255,0.80)", fontSize: "12px", marginTop: "2px" }}>
              {printerAlert.message}
            </div>
          </div>
          <div style={{
            marginLeft: "8px",
            width: "8px", height: "8px", borderRadius: "50%",
            background: "#F2CB07",
            animation: "pulse 1s ease-in-out infinite",
            flexShrink: 0,
          }} />
        </div>
      )}

      {/* ── Error Modal ── */}
      {errorModal && (
        <SupportModal
          message={errorModal}
          onDismiss={() => {
            setErrorModal(null);
            navigate(-1); // go back to metadata so user can retry
          }}
        />
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap');
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0.7; } }
        @keyframes slideDown { from { opacity: 0; transform: translateX(-50%) translateY(-12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }
        ::-webkit-scrollbar { width: 0; }
      `}</style>
    </div>
  );
}