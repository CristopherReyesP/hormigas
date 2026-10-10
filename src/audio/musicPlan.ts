/**
 * The ambient bed's score, apart from its WebAudio: the chord and filter
 * of each mood and when the next bioluminescent chime rings.
 */

/** Chimes ring from A minor pentatonic by day, and from a darker, half-step-heavy set at night. */
export const CHIME_SCALES = {
  day: [880, 1046.5, 1174.7, 1318.5, 1568, 1760, 2093], // A5 C6 D6 E6 G6 A6 C7
  night: [440, 466.2, 659.3, 698.5], // A4 Bb4 E5 F5
} as const;

export interface BedMood {
  /** Pad lowpass center (Hz); a slow LFO wanders around it */
  cutoff: number;
  /** Pad voices (Hz): root, octave, fifth, ninth */
  chord: readonly [number, number, number, number];
  /** Level of the heartbeat pulse under the pad */
  pulse: number;
  /** Level of the dark wind under the pad */
  rumble: number;
}

export const BED_MOODS: Record<'day' | 'night', BedMood> = {
  // A sus2: open, alien, still
  day: { cutoff: 950, chord: [55, 110, 164.8, 246.9], pulse: 0, rumble: 0 },
  // The fifth sinks to a tritone and the ninth to a flat second: the red night
  night: { cutoff: 420, chord: [55, 110, 155.6, 233.1], pulse: 1, rumble: 1 },
};

export interface ChimePlan {
  /** Seconds until this chime */
  delay: number;
  freq: number;
  gain: number;
  pan: number;
}

/** The next chime: frequent and bright by day, sparse, low and quiet at night. */
export function nextChime(rng: () => number, night: boolean): ChimePlan {
  const scale = night ? CHIME_SCALES.night : CHIME_SCALES.day;
  return {
    delay: night ? 6 + rng() * 7 : 2.5 + rng() * 5,
    freq: scale[Math.min(scale.length - 1, Math.floor(rng() * scale.length))],
    gain: night ? 0.06 + rng() * 0.03 : 0.1 + rng() * 0.05,
    pan: (rng() - 0.5) * 1.2,
  };
}
