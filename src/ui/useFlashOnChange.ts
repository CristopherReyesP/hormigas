import { useEffect, useRef, useState } from 'react';

/**
 * Returns a CSS class that pulses (steps(2), ~300ms) whenever `value` changes.
 * Alternates between two identical animations so consecutive changes
 * re-trigger reliably without remounting the element.
 *
 * Usage: <strong className={useFlashOnChange(stats.foodStored)}>{stats.foodStored}</strong>
 */
export function useFlashOnChange(value: number | string): string {
  const prevRef = useRef(value);
  const [phase, setPhase] = useState<0 | 1 | 2>(0); // 0 = never flashed

  useEffect(() => {
    if (prevRef.current !== value) {
      prevRef.current = value;
      setPhase((p) => (p === 1 ? 2 : 1));
    }
  }, [value]);

  return phase === 0 ? '' : phase === 1 ? 'flash-a' : 'flash-b';
}
