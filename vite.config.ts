/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Project page lives at /<repo>/, so assets must resolve from there.
  base: '/hormigas/',
  plugins: [react()],
  // Layout tests read index.css (?raw) to check it mirrors the HUD metrics
  test: { css: { include: [/index\.css/] } },
})
