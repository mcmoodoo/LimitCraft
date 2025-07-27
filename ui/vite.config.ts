import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    global: "globalThis",
    "process.env": {},
  },
  resolve: {
    alias: {
      assert: "assert",
      buffer: "buffer",
      crypto: "crypto-browserify",
      stream: "stream-browserify",
      util: "util",
      process: "process/browser",
      path: "path-browserify",
      fs: "fs",
      os: "os-browserify",
      url: "url",
      querystring: "querystring-es3",
    },
  },
  optimizeDeps: {
    include: [
      "buffer",
      "crypto-browserify",
      "stream-browserify",
      "util",
      "assert",
      "process/browser",
      "path-browserify",
      "os-browserify",
      "url",
      "querystring-es3",
    ],
  },
});
