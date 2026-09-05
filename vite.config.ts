import { defineConfig } from "vite-plus";

export default defineConfig({
  build: {
    ssr: "src/server/main.ts",
    outDir: "dist",
    target: "node24",
    sourcemap: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 15_000,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
