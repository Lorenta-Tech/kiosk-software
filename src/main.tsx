import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./kiosk"; // ← enables full kiosk lockdown

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);