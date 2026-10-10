/** In-play alerts (waves, nest invasion) stay off during the intro and over the end screen, which must stay readable. */
export function showLiveAlerts(stats: { introPlaying?: boolean; gameOver?: unknown }): boolean {
  return !stats.introPlaying && !stats.gameOver;
}
