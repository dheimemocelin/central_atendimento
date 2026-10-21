import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist/web",
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["recharts"],
          ui: ["@radix-ui/react-dialog", "@dnd-kit/core"],
        },
      },
    },
  },
  server: {
    proxy: { "/api": `http://127.0.0.1:${process.env.API_PORT || "3001"}` },
  },
});
