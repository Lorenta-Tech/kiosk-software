// Disable right click
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

// Disable text selection
document.addEventListener("selectstart", (e) => {
  e.preventDefault();
});

// Disable drag
document.addEventListener("dragstart", (e) => {
  e.preventDefault();
});

// Disable keyboard shortcuts
document.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();

  // Reload
  if (
    key === "f5" ||
    (e.ctrlKey && key === "r")
  ) {
    e.preventDefault();
  }

  // DevTools
  if (
    key === "f12" ||
    (e.ctrlKey && e.shiftKey && ["i", "j", "c"].includes(key))
  ) {
    e.preventDefault();
  }

  // View source
  if (e.ctrlKey && key === "u") {
    e.preventDefault();
  }

  // Alt+F4
  if (e.altKey && key === "f4") {
    e.preventDefault();
  }

  // Ctrl+W
  if (e.ctrlKey && key === "w") {
    e.preventDefault();
  }

  // Escape
  if (key === "escape") {
    e.preventDefault();
  }

  // Tab switching
  if (e.altKey && key === "tab") {
    e.preventDefault();
  }
});

// Detect devtools open
setInterval(() => {
  const threshold = 160;

  if (
    window.outerWidth - window.innerWidth > threshold ||
    window.outerHeight - window.innerHeight > threshold
  ) {
    window.location.reload();
  }
}, 1000);