import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri's dev server expects a fixed port and disables the default cleared-
// screen behavior so Cargo and Vite logs interleave readably.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2021",
    sourcemap: false,
  },
});
