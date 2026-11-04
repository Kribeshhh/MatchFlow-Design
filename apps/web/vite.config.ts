import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": { target: process.env.API_PROXY_TARGET || "http://127.0.0.1:3001", ws: true },
    },
  },
  preview: {
    proxy: {
      "/api": { target: process.env.API_PROXY_TARGET || "http://127.0.0.1:3001", ws: true },
    },
  },
});
