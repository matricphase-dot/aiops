import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5199,
    strictPort: true,
    // /api/* (login, logout, me) must reach the socket.io HTTP server.
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
