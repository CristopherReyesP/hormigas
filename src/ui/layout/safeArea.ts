import type { ScreenInsets } from './canvasFit';

/**
 * The window's top and bottom safe-area insets in CSS px (the iPhone notch
 * or Dynamic Island, the home indicator), read from env(safe-area-inset-*)
 * through a hidden probe. Zero outside a notched screen or a browser that
 * lacks env(). The compact HUD's bars grow by these, so the camera must too.
 */
export function readSafeArea(): ScreenInsets {
  if (typeof document === 'undefined' || !document.body) return { top: 0, bottom: 0 };
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;'
    + 'padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
  document.body.appendChild(probe);
  const style = window.getComputedStyle(probe);
  const insets = { top: parseFloat(style.paddingTop) || 0, bottom: parseFloat(style.paddingBottom) || 0 };
  probe.remove();
  return insets;
}
