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
      targets: [{ src: "node_modules/onnxruntime-web/dist/*.wasm", dest: "vendor/ort" }],
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
