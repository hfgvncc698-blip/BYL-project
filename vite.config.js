import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@firebase") || id.includes("firebase/")) return "vendor-firebase";
          if (id.includes("@chakra-ui") || id.includes("@emotion") || id.includes("framer-motion")) return "vendor-ui";
          if (id.includes("@react-pdf") || id.includes("pdfjs-dist")) return "vendor-pdf";
          if (id.includes("react-big-calendar") || id.includes("moment")) return "vendor-calendar";
          if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
          if (id.includes("react-icons")) return "vendor-icons";
          if (id.includes("react-router") || id.includes("react-dom") || id.includes("react/")) return "vendor-react";
          return "vendor";
        },
      },
    },
  },
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
