import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: { global: "globalThis" },
  build: {
    rollupOptions: {
      input: { main: "index.html", admin: "admin.html" },
    },
  },
});