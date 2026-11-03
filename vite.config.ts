import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "decoder-worker-csp",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (
            /^\/decoders\/(basis|draco)-worker\.js(?:\?|$)/.test(
              request.url || "",
            )
          )
            response.setHeader(
              "Content-Security-Policy",
              "default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'",
            );
          next();
        });
      },
    },
  ],
  base: "./",
  server: { port: 5173, strictPort: true },
  build: { chunkSizeWarningLimit: 1000 },
});
