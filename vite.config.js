import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    proxy: {
      // ✅ En DEV : /api -> backend local
      "/api": {
        target: "http://localhost:5050",
        changeOrigin: true,
      },
    },
  },
});
