import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [tailwindcss()],
  worker: { format: "es" },
  build: {
    outDir: "dist/client",
    emptyOutDir: false,
    rollupOptions: {
      input: "src/web/client.tsx",
      output: {
        entryFileNames: "assets/app.js",
        assetFileNames: "assets/app.[ext]",
      },
    },
  },
});
