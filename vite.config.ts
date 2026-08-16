import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GITHUB PAGES: set this to "/<your-repo-name>/" for project pages
// (e.g. served at username.github.io/image-id-game/).
// If you deploy to a user/org page (username.github.io) or a custom
// domain served from root, change this back to "/".
const REPO_BASE = "/image-id-game/";

export default defineConfig({
  base: REPO_BASE,
  plugins: [react()],
  test: {
    environment: "node",
  },
});
