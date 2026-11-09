import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The backend (app/) serves the built files in production. In development the
// API is proxied so the browser only ever talks to one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: false },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
