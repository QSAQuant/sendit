import { defineConfig } from "vite";

// Relative base so the same build works on GitHub Pages, Netlify, or any subpath.
export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
  },
});
