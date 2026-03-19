import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // ✅ En DEV : /api -> backend local
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});

