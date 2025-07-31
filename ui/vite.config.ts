import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    global: "globalThis",
    // Only expose specific environment variables instead of entire process.env
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
    "process.env.VITE_API_URL": JSON.stringify(process.env.VITE_API_URL),
    // Define process.env properties directly
    "process.env": JSON.stringify({
      NODE_ENV: process.env.NODE_ENV || "development",
      VITE_API_URL: process.env.VITE_API_URL,
    }),
    "process.browser": "true",
    "process.version": '""',
    "process.platform": '"browser"',
  },
  resolve: {
    alias: {
      // Shadcn/ui aliases
      "@": path.resolve(__dirname, "./src"),
      "src": path.resolve(__dirname, "./src"),
      // Existing aliases
      assert: "assert",
      buffer: "buffer",
      crypto: "crypto-browserify",
      stream: "stream-browserify",
      events: "events",
      util: "util",
      // Use absolute path for process to fix the warning
      process: path.resolve(__dirname, "node_modules/process/browser.js"),
      path: "path-browserify",
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
      "events",
      "util",
      "assert",
      "path-browserify",
      "os-browserify",
      "querystring-es3",
    ],
    exclude: ["fs"],
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
    },
  },
});
