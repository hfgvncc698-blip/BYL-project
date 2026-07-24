import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll("\\", "/");
          if (!normalizedId.includes("/node_modules/")) return undefined;
          if (
            normalizedId.includes("/node_modules/react/") ||
            normalizedId.includes("/node_modules/react-dom/") ||
            normalizedId.includes("/node_modules/react-router-dom/")
          ) {
            return "vendor-react";
          }
          if (
            normalizedId.includes("/node_modules/@chakra-ui/") ||
            normalizedId.includes("/node_modules/@emotion/") ||
            normalizedId.includes("/node_modules/framer-motion/")
          ) {
            return "vendor-ui";
          }
          if (normalizedId.includes("/node_modules/react-icons/")) return "vendor-icons";
          if (
            normalizedId.includes("/node_modules/@firebase/storage/") ||
            normalizedId.includes("/node_modules/firebase/storage/")
          ) {
            return "vendor-firebase-storage";
          }
          if (
            normalizedId.includes("/node_modules/@firebase/functions/") ||
            normalizedId.includes("/node_modules/firebase/functions/")
          ) {
            return "vendor-firebase-functions";
          }
          if (normalizedId.includes("/node_modules/@firebase/") || normalizedId.includes("/node_modules/firebase/")) {
            return "vendor-firebase";
          }
          return undefined;
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
