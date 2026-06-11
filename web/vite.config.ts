import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    sourcemap: false,
    target: "es2020",
    minify: "esbuild",
    cssMinify: true,
    outDir: "dist",
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        windows: fileURLToPath(new URL("./desktop/renderer.html", import.meta.url)),
      },
    },
  },
});
