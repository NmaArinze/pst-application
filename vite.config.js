import { defineConfig } from "vite";
import { resolve } from "path";

// Vite is used purely as a static-file dev server + bundler for ES modules.
// It introduces no UI framework and no TypeScript — plain HTML/CSS/JS only.
export default defineConfig({
  root: ".",
  envPrefix: "VITE_",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
      },
    },
  },
  server: {
    port: 5173,
  },
});