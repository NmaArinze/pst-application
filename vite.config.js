import { defineConfig } from "vite";
import { resolve } from "path";

// Vite is used purely as a static-file dev server + bundler for ES modules.
// Every HTML page in the app must be listed here as a build input, or
// Vercel's production build will silently leave it out of dist/.
export default defineConfig({
  root: ".",
  envPrefix: "VITE_",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        login: resolve(__dirname, "login.html"),
        participants: resolve(__dirname, "participants.html"),
        templates: resolve(__dirname, "templates.html"),
        campaigns: resolve(__dirname, "campaigns.html"),
        campaignDetail: resolve(__dirname, "campaign-detail.html"),
        emailQueue: resolve(__dirname, "email-queue.html"),
        reports: resolve(__dirname, "reports.html"),
        
      },
    },
  },
  server: {
    port: 5173,
  },
});