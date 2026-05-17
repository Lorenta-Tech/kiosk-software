// ── Kiosk Mode: Block all browser default behaviors ──────────────────────────

// Block right-click context menu (inspect element)
document.addEventListener("contextmenu", (e) => e.preventDefault());

// Block F5, Ctrl+R, Ctrl+Shift+R (reload)
// Block F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U (devtools / view source)
// Block Ctrl+A (select all), Ctrl+S (save), Ctrl+P (print dialog)
document.addEventListener("keydown", (e) => {
  const ctrl = e.ctrlKey || e.metaKey;

  if (
    e.key === "F5"                                       || // reload
    e.key === "F12"                                      || // devtools
    (ctrl && e.key === "r")                              || // reload
    (ctrl && e.key === "R")                              || // reload
    (ctrl && e.shiftKey && e.key === "r")                || // hard reload
    (ctrl && e.shiftKey && e.key === "R")                || // hard reload
    (ctrl && e.shiftKey && e.key === "i")                || // devtools
    (ctrl && e.shiftKey && e.key === "I")                || // devtools
    (ctrl && e.shiftKey && e.key === "j")                || // devtools console
    (ctrl && e.shiftKey && e.key === "J")                || // devtools console
    (ctrl && e.shiftKey && e.key === "c")                || // devtools inspect
    (ctrl && e.shiftKey && e.key === "C")                || // devtools inspect
    (ctrl && e.key === "u")                              || // view source
    (ctrl && e.key === "U")                              || // view source
    (ctrl && e.key === "a")                              || // select all
    (ctrl && e.key === "A")                              || // select all
    (ctrl && e.key === "s")                              || // save page
    (ctrl && e.key === "S")                              || // save page
    (ctrl && e.key === "p")                              || // print
    (ctrl && e.key === "P")                              || // print
    (ctrl && e.key === "f")                              || // find
    (ctrl && e.key === "F")                                 // find
  ) {
    e.preventDefault();
    e.stopPropagation();
  }
});

// Block text selection via CSS injected into <head>
const style = document.createElement("style");
style.textContent = `
  * {
    -webkit-user-select: none !important;
    -moz-user-select:    none !important;
    -ms-user-select:     none !important;
    user-select:         none !important;

    /* iOS/Safari: remove tap highlight flash */
    -webkit-tap-highlight-color: transparent !important;

    /* iOS: remove callout (copy/paste popup) on long press */
    -webkit-touch-callout: none !important;
  }

  /* Allow text selection inside inputs and textareas if you have any */
  input, textarea {
    -webkit-user-select: text !important;
    user-select:         text !important;
  }
`;
document.head.appendChild(style);

// Block drag-and-drop of elements
document.addEventListener("dragstart", (e) => e.preventDefault());

// Block middle-click (opens new tab / scroll mode)
document.addEventListener("auxclick", (e) => e.preventDefault());

// Block double-tap zoom on touch screens
let lastTouchEnd = 0;
document.addEventListener("touchend", (e) => {
  const now = Date.now();
  if (now - lastTouchEnd < 300) {
    e.preventDefault();
  }
  lastTouchEnd = now;
}, { passive: false });

// Block pinch-to-zoom
document.addEventListener("touchmove", (e) => {
  if ((e as TouchEvent).touches.length > 1) {
    e.preventDefault();
  }
}, { passive: false });

// Block wheel zoom (Ctrl + scroll)
document.addEventListener("wheel", (e) => {
  if (e.ctrlKey) e.preventDefault();
}, { passive: false });