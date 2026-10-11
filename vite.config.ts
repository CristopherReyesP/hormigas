/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The game's version, shown small on the title screen and the pause menu so a
 * player can tell whether the page updated: the build's date and time (UTC)
 * and the commit it was built from.
 */
function gameVersion(): string {
  let commit = process.env.GITHUB_SHA?.slice(0, 7) ?? ''
  if (!commit) {
    try {
      commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {
      commit = 'dev'
    }
  }
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  return `v${stamp} · ${commit}`
}

// https://vite.dev/config/
export default defineConfig({
  // Project page lives at /<repo>/, so assets must resolve from there.
  base: '/hormigas/',
  plugins: [react()],
  define: { __GAME_VERSION__: JSON.stringify(gameVersion()) },
  // Layout tests read index.css (?raw) to check it mirrors the HUD metrics
  test: { css: { include: [/index\.css/] } },
})
