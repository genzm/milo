import type { Rendered } from './render/lifecycle';

const SELECTOR =
  '.slide-card, .step-card, .canvas-node:not(.canvas-shape-ellipse):not(.canvas-shape-diamond)';
const FALLBACK_RATIO = 0.12;

/** Share of the shorter side. `12%` and `0.12` both mean the same corner. */
export function parseRadiusRatio(raw: string, fallback = FALLBACK_RATIO) {
  const text = raw.trim();
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  if (text.endsWith('%') || value > 1) return value / 100;
  return value;
}

/** Circular corner length. A wide box and a tall box keep the same curve. */
export function cornerRadius(width: number, height: number, ratio: number) {
  const short = Math.min(width, height);
  if (!(short > 0) || !(ratio > 0)) return 0;
  return Math.round(short * ratio * 100) / 100;
}

function radiusRatio() {
  if (typeof getComputedStyle !== 'function') return FALLBACK_RATIO;
  return parseRadiusRatio(
    getComputedStyle(document.documentElement).getPropertyValue('--slide-radius-ratio'),
  );
}

function sync(root: ParentNode) {
  const ratio = radiusRatio();
  for (const element of root.querySelectorAll<HTMLElement>(SELECTOR)) {
    const radius = cornerRadius(element.offsetWidth, element.offsetHeight, ratio);
    if (radius <= 0) continue;
    const next = `${radius}px`;
    if (element.style.getPropertyValue('--slide-radius') !== next)
      element.style.setProperty('--slide-radius', next);
  }
}

/** Keep box, step, and canvas corners proportional after layout. */
export function watchSlideCorners(root: ParentNode): Rendered {
  const observer =
    typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => sync(root));
  const seen = new Set<Element>();
  const update = () => {
    if (observer) {
      for (const element of root.querySelectorAll(SELECTOR)) {
        if (seen.has(element)) continue;
        seen.add(element);
        observer.observe(element);
      }
    }
    sync(root);
  };
  return {
    update,
    dispose: () => observer?.disconnect(),
  };
}
