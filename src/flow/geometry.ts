import type { FlowFrame } from './types.ts';

export type Side = 'top' | 'right' | 'bottom' | 'left';
export type Point = { x: number; y: number };

export function portPoint(frame: FlowFrame, side: Side, t: number): Point {
  const x0 = frame.x;
  const y0 = frame.y;
  const x1 = frame.x + frame.width;
  const y1 = frame.y + frame.height;
  const along = Math.min(0.85, Math.max(0.15, t));
  if (side === 'top') return { x: x0 + frame.width * along, y: y0 };
  if (side === 'bottom') return { x: x0 + frame.width * along, y: y1 };
  if (side === 'left') return { x: x0, y: y0 + frame.height * along };
  return { x: x1, y: y0 + frame.height * along };
}

export function inflate(box: FlowFrame, pad: number): FlowFrame {
  return {
    x: box.x - pad,
    y: box.y - pad,
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  };
}

// Clip the segment against both closed axis intervals. Unlike strict
// segment/segment crossing, this also catches tangencies and collinear edges.
function segmentHits(a: Point, b: Point, box: FlowFrame) {
  let entry = 0,
    exit = 1;
  for (const [origin, delta, low, high] of [
    [a.x, b.x - a.x, box.x, box.x + box.width],
    [a.y, b.y - a.y, box.y, box.y + box.height],
  ]) {
    if (delta === 0) {
      if (origin < low || origin > high) return false;
      continue;
    }
    const t0 = (low - origin) / delta;
    const t1 = (high - origin) / delta;
    entry = Math.max(entry, Math.min(t0, t1));
    exit = Math.min(exit, Math.max(t0, t1));
    if (entry > exit) return false;
  }
  return true;
}

export function polylineHits(points: Point[], obstacles: FlowFrame[]) {
  for (let i = 0; i < points.length - 1; i += 1) {
    if (obstacles.some((box) => segmentHits(points[i], points[i + 1], box))) return true;
  }
  return false;
}

function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u ** 3 * p0.x + 3 * u ** 2 * t * p1.x + 3 * u * t ** 2 * p2.x + t ** 3 * p3.x,
    y: u ** 3 * p0.y + 3 * u ** 2 * t * p1.y + 3 * u * t ** 2 * p2.y + t ** 3 * p3.y,
  };
}

function quadPoint(p0: Point, p1: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

export function cubicControls(start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const bend = horizontal ? Math.max(35, Math.abs(dx) * 0.42) : Math.max(35, Math.abs(dy) * 0.42);
  return horizontal
    ? {
        c1: { x: start.x + Math.sign(dx || 1) * bend, y: start.y },
        c2: { x: end.x - Math.sign(dx || 1) * bend, y: end.y },
      }
    : {
        c1: { x: start.x, y: start.y + Math.sign(dy || 1) * bend },
        c2: { x: end.x, y: end.y - Math.sign(dy || 1) * bend },
      };
}

export function sampleCubic(p0: Point, c1: Point, c2: Point, p3: Point, steps = 12) {
  return Array.from({ length: steps + 1 }, (_, i) => cubicPoint(p0, c1, c2, p3, i / steps));
}

export function sampleQuad(p0: Point, c1: Point, p2: Point, steps = 12) {
  return Array.from({ length: steps + 1 }, (_, i) => quadPoint(p0, c1, p2, i / steps));
}

function numbersOf(body: string) {
  return [...body.matchAll(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/g)].map((match) =>
    Number(match[0]),
  );
}

function samplePath(path: string): Point[] {
  const points: Point[] = [];
  let current = { x: 0, y: 0 };
  for (const match of path.matchAll(/([MLQC])([^MLQC]*)/g)) {
    const nums = numbersOf(match[2]);
    if ((match[1] === 'M' || match[1] === 'L') && nums.length >= 2) {
      current = { x: nums[0], y: nums[1] };
      points.push(current);
      continue;
    }
    if (match[1] === 'C' && nums.length >= 6) {
      const c1 = { x: nums[0], y: nums[1] };
      const c2 = { x: nums[2], y: nums[3] };
      const end = { x: nums[4], y: nums[5] };
      points.push(...sampleCubic(current, c1, c2, end).slice(1));
      current = end;
      continue;
    }
    if (match[1] === 'Q' && nums.length >= 4) {
      const control = { x: nums[0], y: nums[1] };
      const end = { x: nums[2], y: nums[3] };
      points.push(...sampleQuad(current, control, end).slice(1));
      current = end;
    }
  }
  return points;
}

export function graphBounds(frames: FlowFrame[]): FlowFrame {
  const xs = frames.map((frame) => frame.x);
  const ys = frames.map((frame) => frame.y);
  const rights = frames.map((frame) => frame.x + frame.width);
  const bottoms = frames.map((frame) => frame.y + frame.height);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...rights) - x, height: Math.max(...bottoms) - y };
}

export function edgeHitsNode(path: string, box: FlowFrame) {
  return polylineHits(samplePath(path), [inflate(box, 1)]);
}
