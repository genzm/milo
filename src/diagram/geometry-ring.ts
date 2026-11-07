import {
  type DiagramBox,
  type Vec,
  type DiagramPlacedItem,
  type DiagramNoteSide,
  type DiagramStart,
  type DiagramOrder,
} from './types';
import { PAD, NOTE_SIDE_VECTOR, START_PHI } from './constants';

export { overlaps, closestPointOnBox } from './geometry.ts';

export function clampBox(box: DiagramBox, width: number, height: number) {
  box.x = Math.min(Math.max(PAD, box.x), Math.max(PAD, width - PAD - box.width));
  box.y = Math.min(Math.max(PAD, box.y), Math.max(PAD, height - PAD - box.height));
}

export function boxCenter(box: DiagramBox): Vec {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function normalize(x: number, y: number): Vec {
  const dist = Math.hypot(x, y) || 1;
  return { x: x / dist, y: y / dist };
}

function shiftBox(box: DiagramBox | undefined, dx: number, dy: number) {
  if (!box) return;
  box.x += dx;
  box.y += dy;
}

function unionBox(a?: DiagramBox, b?: DiagramBox): DiagramBox | undefined {
  if (!a) return b ? { ...b } : undefined;
  if (!b) return { ...a };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

export function annotationBox(item: DiagramPlacedItem): DiagramBox | undefined {
  return unionBox(item.label, item.note);
}

export function shiftAnnotation(item: DiagramPlacedItem, dx: number, dy: number) {
  shiftBox(item.label, dx, dy);
  shiftBox(item.note, dx, dy);
}

export function boxLeavesFrame(box: DiagramBox, width: number, height: number, gap = 0) {
  return (
    box.x < PAD - gap ||
    box.y < PAD - gap ||
    box.x + box.width > width - PAD + gap ||
    box.y + box.height > height - PAD + gap
  );
}

export function segmentHitsBox(a: Vec, b: Vec, box: DiagramBox, pad = 8) {
  const minX = box.x - pad,
    maxX = box.x + box.width + pad,
    minY = box.y - pad,
    maxY = box.y + box.height + pad;
  let t0 = 0,
    t1 = 1;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return (
    clip(-dx, a.x - minX) && clip(dx, maxX - a.x) && clip(-dy, a.y - minY) && clip(dy, maxY - a.y)
  );
}

export function outwardUnit(point: Vec, origin: Vec, side: DiagramNoteSide): Vec {
  if (side !== 'auto') return NOTE_SIDE_VECTOR[side];
  const x = point.x - origin.x,
    y = point.y - origin.y;
  if (Math.hypot(x, y) < 1e-6) return { x: 0, y: -1 };
  return normalize(x, y);
}

export function angle(i: number, n: number, start: DiagramStart, order: DiagramOrder) {
  const step = (2 * Math.PI) / Math.max(n, 1);
  const sign = order === 'cw' ? 1 : -1;
  return START_PHI[start] + sign * i * step;
}

export function pointOnRing(cx: number, cy: number, radius: number, phi: number) {
  return { x: cx + radius * Math.sin(phi), y: cy - radius * Math.cos(phi) };
}
