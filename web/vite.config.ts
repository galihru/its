import { resolve } from "node:path";
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
        main: resolve(__dirname, "index.html"),
        windows: resolve(__dirname, "windows.html"),
      },
    },
  },
});
