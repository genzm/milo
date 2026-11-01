import { overlaps } from './geometry.ts';
import { boxLeaves, type Box, type SpatialFrame, type Vec } from './spatial.ts';

export const LABEL_DIRS: Vec[] = [
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
];

export function estimatePlainSize(
  text: string,
  font: number,
  maxWidth: number,
  lineHeight: number,
) {
  let units = 0;
  for (const ch of text) units += /[\u3000-\u9fff]/.test(ch) ? 1 : 0.55;
  const width = Math.min(maxWidth, Math.max(40, units * font + 8));
  const lines = Math.max(1, Math.ceil((units * font) / Math.max(32, width)));
  return { width, height: lines * font * lineHeight };
}

export function estimateFieldLabel(title: string, maxWidth = 180) {
  return estimatePlainSize(title.trim() || ' ', 18, maxWidth, 1.35);
}

export function labelAlong(
  anchor: Vec,
  size: { width: number; height: number },
  dir: Vec,
  gap = 12,
): Box {
  const half = (Math.abs(dir.x) * size.width + Math.abs(dir.y) * size.height) / 2;
  const dist = gap + half;
  return {
    x: anchor.x + dir.x * dist - size.width / 2,
    y: anchor.y + dir.y * dist - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

export function placeAnchoredLabel(
  anchor: Vec,
  size: { width: number; height: number },
  preferred: Vec,
  obstacles: Box[],
  frame: SpatialFrame,
): { box: Box; overflow: boolean } {
  const ranked = [...LABEL_DIRS].sort((a, b) => {
    const da = a.x * preferred.x + a.y * preferred.y;
    const db = b.x * preferred.x + b.y * preferred.y;
    return db - da;
  });
  for (const dir of ranked) {
    const box = labelAlong(anchor, size, dir);
    if (boxLeaves(box, frame, 4)) continue;
    if (obstacles.some((other) => overlaps(box, other, 8))) continue;
    return { box, overflow: false };
  }
  return { box: labelAlong(anchor, size, preferred), overflow: true };
}
