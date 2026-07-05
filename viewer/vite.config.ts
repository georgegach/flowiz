import { defineConfig } from "vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

// Deployed under https://georgegach.github.io/flowiz/ (Pages project site).
export default defineConfig({
  base: "./",
  plugins: [
    // Serve onnxruntime-web's wasm assets at /vendor/ort/ (referenced at runtime
    // via ort.env.wasm.wasmPaths). Pin onnxruntime-web exactly — these filenames
    // change across minor versions.
    viteStaticCopy({
      targets: [
        { src: "node_modules/onnxruntime-web/dist/*.wasm", dest: "vendor/ort" },
        // Single-threaded ffmpeg.wasm (no SharedArrayBuffer → works on GitHub
        // Pages, which can't set COOP/COEP). Loaded at runtime from absolute
        // same-origin URLs by src/video/ffmpeg-decode.ts. The whole @ffmpeg/ffmpeg
        // esm package is copied so the class worker's relative imports (const.js,
        // errors.js) resolve as native ES modules; the module worker then
        // import()s the esm core.
        { src: "node_modules/@ffmpeg/ffmpeg/dist/esm/*.js", dest: "vendor/ffmpeg/pkg" },
        { src: "node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js", dest: "vendor/ffmpeg/core" },
        { src: "node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm", dest: "vendor/ffmpeg/core" },
      ],
    }),
  ],
  worker: {
    format: "es",
  },
  optimizeDeps: {
    exclude: ["onnxruntime-web"],
  },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
  },
});
