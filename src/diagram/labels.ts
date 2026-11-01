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

export function estimateZoneLabel(title: string, maxWidth = 200) {
  return estimatePlainSize(title.trim() || ' ', 18, maxWidth, 1.3);
}

export function textBox(
  text: string,
  x: number,
  y: number,
  anchor: 'start' | 'middle' | 'end' = 'start',
  font = 18,
): Box {
  const size = estimatePlainSize(text.trim() || ' ', font, 220, 1.25);
  const left = anchor === 'end' ? x - size.width : anchor === 'middle' ? x - size.width / 2 : x;
  return { x: left, y: y - font * 0.85, width: size.width, height: size.height };
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
): { box: Box; overflow: boolean; gap: number } {
  const ranked = [...LABEL_DIRS].sort((a, b) => {
    const da = a.x * preferred.x + a.y * preferred.y;
    const db = b.x * preferred.x + b.y * preferred.y;
    return db - da;
  });
  for (const gap of [12, 30, 48]) {
    for (const dir of ranked) {
      const box = labelAlong(anchor, size, dir, gap);
      if (boxLeaves(box, frame, 4)) continue;
      if (obstacles.some((other) => overlaps(box, other, 8))) continue;
      return { box, overflow: false, gap };
    }
  }
  return { box: labelAlong(anchor, size, preferred), overflow: true, gap: 12 };
}

function zoneCorner(
  zone: Box,
  size: { width: number; height: number },
  corner: 'nw' | 'ne' | 'sw' | 'se',
  pad = 10,
): Box {
  return {
    x: corner.includes('e') ? zone.x + zone.width - size.width - pad : zone.x + pad,
    y: corner.includes('s') ? zone.y + zone.height - size.height - pad : zone.y + pad,
    width: size.width,
    height: size.height,
  };
}

export function placeZoneLabel(
  zone: Box,
  size: { width: number; height: number },
  prefer: Vec,
  obstacles: Box[],
  frame: SpatialFrame,
): { box: Box; overflow: boolean } {
  const vertical = prefer.y >= 0 ? (['n', 's'] as const) : (['s', 'n'] as const);
  const horizontal = prefer.x <= 0 ? (['w', 'e'] as const) : (['e', 'w'] as const);
  const corners = [
    `${vertical[0]}${horizontal[0]}`,
    `${vertical[0]}${horizontal[1]}`,
    `${vertical[1]}${horizontal[0]}`,
    `${vertical[1]}${horizontal[1]}`,
  ] as const;
  const candidates: Box[] = [
    ...corners.map((corner) => zoneCorner(zone, size, corner as 'nw' | 'ne' | 'sw' | 'se')),
    {
      x: zone.x + (zone.width - size.width) / 2,
      y: zone.y + 10,
      width: size.width,
      height: size.height,
    },
    {
      x: zone.x + (zone.width - size.width) / 2,
      y: zone.y + zone.height - size.height - 10,
      width: size.width,
      height: size.height,
    },
  ];
  for (const box of candidates) {
    if (boxLeaves(box, frame, 2)) continue;
    if (obstacles.some((other) => overlaps(box, other, 10))) continue;
    return { box, overflow: false };
  }
  return { box: candidates[0], overflow: true };
}
