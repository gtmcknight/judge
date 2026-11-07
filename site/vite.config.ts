import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// A relative base and one page with hash routing, so the export loads from a gateway subpath or an
// ENS name with no server rewrites. It builds to dist/ at the repository root, where IMD's publisher
// pins it from.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true, assetsInlineLimit: 0 },
});
