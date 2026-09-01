import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import tailwindPolyfill from "../src/index.ts";

// https://vite.dev/config/
export default defineConfig({
  server: {
    allowedHosts: true,
    host: "0.0.0.0",
  },

  plugins: [react(), tailwindcss(), tailwindPolyfill()],

  build: {
    target: "es2015",
    rolldownOptions: {},
  },

  worker: { format: "es" },
  resolve: { tsconfigPaths: true },
});
