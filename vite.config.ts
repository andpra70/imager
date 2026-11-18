import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/klein-api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/klein-api/, ''),
      },
    },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/klein-api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/klein-api/, ''),
      },
    },
  },
  base: "./",
  plugins: [react()],
});
