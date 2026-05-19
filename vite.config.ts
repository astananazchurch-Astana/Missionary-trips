import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/Missionary-trips/",
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://127.0.0.1:4000",
        changeOrigin: true,
      },
    },
  },
});
