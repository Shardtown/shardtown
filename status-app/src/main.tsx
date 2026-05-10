import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { applyTheme, getStoredTheme } from "./lib/theme";

// Apply the saved theme before React renders so users on light mode
// don't see a flash of dark while the SPA boots.
applyTheme(getStoredTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
