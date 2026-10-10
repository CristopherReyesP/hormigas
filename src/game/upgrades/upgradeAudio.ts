import { emitAudio } from '../../audio/events';

/** The level-up fanfare for a bought upgrade; it climbs with the level */
export function emitUpgradeAudio(level: number): void {
  emitAudio({ type: 'upgrade', level });
}
