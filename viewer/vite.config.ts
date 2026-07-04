import { defineConfig } from "vite";

// Deployed under https://georgegach.github.io/flowiz/ (Pages project site).
export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    outDir: "dist",
    emptyOutDir: true,
  },
});
