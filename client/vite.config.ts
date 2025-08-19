/// <reference types="vitest" />

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'


// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  test: {
    globals: true,         // so you don’t need to import describe/it/expect in every test
    environment: "jsdom",  // 👈 use jsdom so `document` exists
  },
}
);
