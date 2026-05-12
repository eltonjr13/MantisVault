import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const sodiumSumoMain = require.resolve("libsodium-sumo");
const sodiumSumoRoot = resolve(dirname(sodiumSumoMain), "../..");
const sodiumSumoEsm = join(sodiumSumoRoot, "dist/modules-sumo-esm/libsodium-sumo.mjs");

export default defineConfig({
  plugins: [react()],
  build: {
    target: "esnext"
  },
  esbuild: {
    target: "esnext"
  },
  resolve: {
    alias: {
      "./libsodium-sumo.mjs": sodiumSumoEsm
    }
  },
  optimizeDeps: {
    exclude: ['libsodium-wrappers-sumo', 'libsodium-sumo']
  },
  server: {
    host: "0.0.0.0",
    port: 5173
  }
});
