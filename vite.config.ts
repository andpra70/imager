import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath,URL } from "node:url";

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
  optimizeDeps: {
    // The pre-bundled CommonJS build selects Fengari's Node branch before
    // worker transforms are applied. Keep it in Vite's browser pipeline.
    exclude: ["fengari"],
  },
  resolve: {
    alias: {
      os: fileURLToPath(new URL("./src/shims/nodeOs.ts",import.meta.url)),
    },
  },
  // Fengari's browser branch is selected at runtime, but its config reads this
  // Node expression before checking `typeof process`. Replace only that config
  // access; do not provide a fake global `process`, which would enable Node I/O.
  define: {
    "process.env.FENGARICONF": "undefined",
    "process": "undefined",
  },
  plugins: [react()],
});
