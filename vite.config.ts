import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath,URL } from "node:url";
import { readFile } from "node:fs/promises";

function kleinRelayTarget(request: { headers: Record<string, string | string[] | undefined> }) {
  const raw = request.headers["x-klein-base-url"];
  const value = (Array.isArray(raw) ? raw[0] : raw ?? "").replace(/\/$/, "");
  if (!/^http:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|127\.0\.0\.1(?::|\/|$)|193\.168\.1\.177(?::|\/|$))/.test(value)) {
    return "http://127.0.0.1:1";
  }
  return value;
}

const kleinRelayProxy = {
  target: "http://127.0.0.1:8000",
  changeOrigin: true,
  router: kleinRelayTarget,
  rewrite: (path: string) => path.replace(/^\/klein-relay/, ""),
};

export default defineConfig(() => {
  return ({
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: { '/klein-relay': kleinRelayProxy },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: { '/klein-relay': kleinRelayProxy },
  },
  base: "./",
  optimizeDeps: {
    // The pre-bundled CommonJS build selects Fengari's Node branch before
    // worker transforms are applied. Keep it in Vite's browser pipeline.
    // browser-inswapper must also pass through the compatibility transform
    // below: Vite 5 cannot parse its dynamic Worker `name` option.
    exclude: ["fengari", "browser-inswapper"],
  },
  resolve: {
    alias: {
      os: fileURLToPath(new URL("./src/shims/nodeOs.ts",import.meta.url)),
      // La release Git installata espone i sorgenti ma non include ancora dist/.
      "browser-inswapper": fileURLToPath(new URL("./node_modules/browser-inswapper/src/index.ts", import.meta.url)),
    },
  },
  // Fengari's browser branch is selected at runtime, but its config reads this
  // Node expression before checking `typeof process`. Replace only that config
  // access; do not provide a fake global `process`, which would enable Node I/O.
  define: {
    "process.env.FENGARICONF": "undefined",
    "process": "undefined",
  },
  plugins: [
    {
      name: "browser-inswapper-vite5-worker-options",
      enforce: "pre",
      async load(id) {
        const cleanId = id.split("?", 1)[0];
        if (!cleanId.endsWith("@mediapipe/tasks-vision/vision_bundle.mjs")) return null;
        // Il pacchetto 0.10.35 riferisce un file .map non distribuito.
        const code = await readFile(cleanId, "utf8");
        return code.replace(/\n?\/\/# sourceMappingURL=vision_bundle_mjs\.js\.map\s*$/, "");
      },
      transform(code, id) {
        const cleanId = id.split("?", 1)[0];
        if (cleanId.endsWith("browser-inswapper/src/worker.ts")) {
          return code.replace(
            "for (let i = 0; i < 5; i++) await s.run(target, source);",
            "for (let i = 0; i < 5; i++) { post({ type: 'log', message: b + ': benchmark ' + (i + 1) + '/5' }); await s.run(target, source); }",
          );
        }
        if (!cleanId.endsWith("browser-inswapper/src/index.ts")) return null;
        // Vite 5 richiede opzioni Worker interamente statiche.
        return code.replace(
          /\{\s*type:\s*(["'])module\1,\s*name\s*\}/g,
          (_match, quote: string) => `{ type: ${quote}module${quote} }`,
        );
      },
    },
    react(),
  ],
  });
});
