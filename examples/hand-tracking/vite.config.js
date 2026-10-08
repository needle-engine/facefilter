import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  base: "./",
  plugins: [basicSsl()],
  resolve: { dedupe: ["three", "@needle-tools/engine"] },
  // Compile the linked library's decorators and GLB URL imports through Vite.
  optimizeDeps: { exclude: ["@needle-tools/facefilter"] },
});
