import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { applyTheme, getStoredTheme } from "./lib/theme";
import { IS_DESKTOP } from "./lib/desktop";

// Apply the saved theme before React renders so users on light mode
// don't see a flash of dark while the SPA boots.
applyTheme(getStoredTheme());

// Marque <html> pour qu'index.css puisse différencier le SPA web
// (avec son backdrop coloré) du shell Tauri (fond plat var(--ds-bg)).
if (IS_DESKTOP) document.documentElement.classList.add("is-desktop");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
