// vite.config.ts 
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tailwindcss(), tsconfigPaths()],
  // Standard app build: Vite uses index.html as the entry automatically.
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});

