import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  audioSettings,
  MUTE_MODE_LABELS,
  nextMuteMode,
  VOLUME_KEYS,
  VOLUME_LABELS,
  type AudioSettingsStore,
  type MuteMode,
} from '../settings';

/** 8×8 art pixels, drawn at 2× like the strip's other pixel icons: a speaker, then its waves or an X. */
const SPEAKER: ReadonlyArray<readonly [number, number]> = [
  [3, 1], [2, 2], [3, 2], [0, 3], [1, 3], [2, 3], [3, 3], [0, 4], [1, 4], [2, 4], [3, 4], [2, 5], [3, 5], [3, 6],
];
const NEAR_WAVE: ReadonlyArray<readonly [number, number]> = [[5, 3], [5, 4]];
const FAR_WAVE: ReadonlyArray<readonly [number, number]> = [[6, 1], [7, 2], [7, 3], [7, 4], [7, 5], [6, 6]];
const CROSS: ReadonlyArray<readonly [number, number]> = [[4, 2], [7, 2], [5, 3], [6, 3], [5, 4], [6, 4], [4, 5], [7, 5]];

const ICON_PIXELS: Record<MuteMode, ReadonlyArray<readonly [number, number]>> = {
  on: [...SPEAKER, ...NEAR_WAVE, ...FAR_WAVE],
  noMusic: [...SPEAKER, ...NEAR_WAVE],
  muted: [...SPEAKER, ...CROSS],
};

function SpeakerIcon({ mode }: { mode: MuteMode }) {
  return (
    <svg className="pixel-icon" width="16" height="16" viewBox="0 0 8 8" shapeRendering="crispEdges" aria-hidden="true">
      {ICON_PIXELS[mode].map(([x, y]) => (
        <rect key={`${x},${y}`} x={x} y={y} width="1" height="1" fill="currentColor" />
      ))}
    </svg>
  );
}

function Caret() {
  return (
    <svg width="10" height="6" viewBox="0 0 5 3" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="0" y="0" width="5" height="1" fill="currentColor" />
      <rect x="1" y="1" width="3" height="1" fill="currentColor" />
      <rect x="2" y="2" width="1" height="1" fill="currentColor" />
    </svg>
  );
}

/**
 * The top strip's speaker: a click cycles sound on → no music → muted, and
 * the caret opens four volume sliders. Settings live in the audio settings
 * store (persisted), so they survive a restart and a reload.
 */
export function SoundToggle({ store = audioSettings }: { store?: AudioSettingsStore }) {
  const settings = useSyncExternalStore(store.subscribe, store.get, store.get);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // A click anywhere else or Escape closes the sliders
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const { mode } = settings;
  const label = `${MUTE_MODE_LABELS[mode]}. Clic: ${MUTE_MODE_LABELS[nextMuteMode(mode)].toLowerCase()}`;

  return (
    <div className="strip-sound" ref={rootRef}>
      <button
        type="button"
        className={`strip-item strip-sound-toggle strip-sound--${mode}`}
        title={label}
        aria-label={label}
        onMouseDown={(e) => e.preventDefault()} // keep focus off: Space must stay the pause key
        onClick={() => store.cycleMode()}
      >
        <SpeakerIcon mode={mode} />
      </button>
      <button
        type="button"
        className="strip-item strip-sound-more"
        title="Volumen"
        aria-label="Volumen"
        aria-expanded={open}
        aria-haspopup="dialog"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
      >
        <Caret />
      </button>
      {open && (
        <div className="strip-sound-popover chrome-plate" role="dialog" aria-label="Volumen">
          <div className="chrome-plate-inner strip-sound-popover-inner">
            {VOLUME_KEYS.map((key) => {
              const percent = Math.round(settings[key] * 100);
              return (
                <label key={key} className="sound-slider">
                  <span className="sound-slider-label">{VOLUME_LABELS[key]}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={percent}
                    onChange={(e) => store.update({ [key]: Number(e.target.value) / 100 })}
                  />
                  <span className="sound-slider-value">{percent}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
