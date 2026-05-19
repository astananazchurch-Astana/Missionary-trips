import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const base = process.env.VITE_BASE_PATH || (process.env.VERCEL ? "/" : "/Missionary-trips/");

export default defineConfig({
  plugins: [react()],
  base,
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://127.0.0.1:4000",
        changeOrigin: true,
      },
    },
  },
});
