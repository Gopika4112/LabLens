/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const here = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(here, "../../api");

/**
 * Dev-only bridge: serves the same serverless handlers in /api that Vercel deploys,
 * so `npm run dev` exercises the real AI proxy (needs ANTHROPIC_API_KEY in the env).
 */
function apiDev(): Plugin {
  return {
    name: "lablens-api-dev",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (!req.url?.startsWith("/api/")) return next();
        const name = req.url
          .slice(5)
          .split("?")[0]
          .replace(/[^a-z-]/g, "");
        try {
          const mod = (await server.ssrLoadModule(path.join(apiDir, `${name}.ts`))) as Record<string, (r: Request) => Promise<Response>>;
          const handler = mod[req.method ?? "GET"];
          if (!handler) {
            res.statusCode = 405;
            return res.end();
          }
          const chunks: Buffer[] = [];
          for await (const c of req) chunks.push(c as Buffer);
          const body = chunks.length ? Buffer.concat(chunks) : undefined;
          const request = new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers as Record<string, string>, body });
          const response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
      });
    },
  };
}

// dev only: make server-side AI keys from the repo-root .env visible to the /api handlers
for (const [k, v] of Object.entries(loadEnv("development", path.resolve(here, "../.."), ""))) {
  if (/^(GEMINI|OLLAMA|OPENROUTER|GROQ|ANTHROPIC|LLM)_/.test(k) && process.env[k] === undefined) process.env[k] = v;
}

export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  plugins: [
    react(),
    tailwindcss(),
    apiDev(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "LabLens — sketch to simulation lab",
        short_name: "LabLens",
        description: "Turn a physics problem into a live, verified, accessible simulation lab. Works offline.",
        theme_color: "#172033",
        background_color: "#f5f2ea",
        display: "standalone",
        start_url: ".",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,webmanifest}"],
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  worker: { format: "es" },
  build: { target: "es2022", sourcemap: false, chunkSizeWarningLimit: 900 },
  test: { environment: "jsdom", include: ["src/**/*.test.{ts,tsx}"] },
});
