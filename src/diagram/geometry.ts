import { boxCenter, type Box, type Vec } from './spatial.ts';

export function overlaps(a: Box, b: Box, gap = 8) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

export function closestPointOnBox(box: Box, point: Vec): Vec {
  const left = box.x,
    right = box.x + box.width,
    top = box.y,
    bottom = box.y + box.height;
  if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) {
    const candidates = [
      { x: left, y: point.y, d: point.x - left },
      { x: right, y: point.y, d: right - point.x },
      { x: point.x, y: top, d: point.y - top },
      { x: point.x, y: bottom, d: bottom - point.y },
    ];
    candidates.sort((a, b) => a.d - b.d);
    return { x: candidates[0].x, y: candidates[0].y };
  }
  return {
    x: Math.min(Math.max(point.x, left), right),
    y: Math.min(Math.max(point.y, top), bottom),
  };
}

export function closestPointOnCircle(center: Vec, radius: number, toward: Vec): Vec {
  const unit = (() => {
    const dx = toward.x - center.x,
      dy = toward.y - center.y,
      dist = Math.hypot(dx, dy);
    if (dist < 1e-6) return { x: 0, y: -1 };
    return { x: dx / dist, y: dy / dist };
  })();
  return { x: center.x + unit.x * radius, y: center.y + unit.y * radius };
}

function rimPoint(box: Box, toward: Vec, circular: boolean): Vec {
  const center = boxCenter(box);
  if (circular) return closestPointOnCircle(center, Math.min(box.width, box.height) / 2, toward);
  return closestPointOnBox(box, toward);
}

export function perimeterLink(
  from: Box,
  to: Box,
  kinds: { from: 'circle' | 'box'; to: 'circle' | 'box' } = { from: 'box', to: 'box' },
): { path: string; labelAt: Vec } | null {
  const a = boxCenter(from);
  const b = boxCenter(to);
  const start = rimPoint(from, b, kinds.from === 'circle');
  const end = rimPoint(to, a, kinds.to === 'circle');
  const dx = end.x - start.x,
    dy = end.y - start.y,
    dist = Math.hypot(dx, dy);
  if (dist < 6) return null;
  return {
    path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
    labelAt: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 10 },
  };
}

export function leaderPath(from: Box, to: Box, circular = true): string | null {
  const start = rimPoint(from, boxCenter(to), circular);
  const end = closestPointOnBox(to, start);
  const dx = end.x - start.x,
    dy = end.y - start.y,
    dist = Math.hypot(dx, dy);
  if (dist < 22) return null;
  const inset = Math.min(8, dist * 0.16);
  return `M ${start.x} ${start.y} L ${end.x - (dx / dist) * inset} ${end.y - (dy / dist) * inset}`;
}

export function rayHalf(size: { width: number; height: number }, dx: number, dy: number) {
  return (Math.abs(dx) * size.width + Math.abs(dy) * size.height) / 2;
}

export const CLUSTER_PAD = 36;

function uniquePoints(points: Vec[]) {
  const seen: Vec[] = [];
  for (const point of points) {
    if (seen.some((other) => Math.hypot(other.x - point.x, other.y - point.y) < 1)) continue;
    seen.push(point);
  }
  return seen;
}

function convexHull(points: Vec[]) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Vec, a: Vec, b: Vec) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec[] = [];
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: Vec[] = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const point = sorted[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function circlePath(center: Vec, radius: number) {
  return `M ${center.x + radius} ${center.y} A ${radius} ${radius} 0 1 1 ${center.x - radius} ${center.y} A ${radius} ${radius} 0 1 1 ${center.x + radius} ${center.y} Z`;
}

function stadiumPath(a: Vec, b: Vec, radius: number): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return circlePath(a, radius);
  const nx = -dy / len;
  const ny = dx / len;
  const a1 = { x: a.x + nx * radius, y: a.y + ny * radius };
  const a2 = { x: a.x - nx * radius, y: a.y - ny * radius };
  const b1 = { x: b.x + nx * radius, y: b.y + ny * radius };
  const b2 = { x: b.x - nx * radius, y: b.y - ny * radius };
  return `M ${a1.x} ${a1.y} L ${b1.x} ${b1.y} A ${radius} ${radius} 0 0 1 ${b2.x} ${b2.y} L ${a2.x} ${a2.y} A ${radius} ${radius} 0 0 1 ${a1.x} ${a1.y} Z`;
}

function roundedOffset(hull: Vec[], radius: number): string {
  if (hull.length < 3) return stadiumPath(hull[0], hull[hull.length - 1] || hull[0], radius);
  const cx = hull.reduce((sum, point) => sum + point.x, 0) / hull.length;
  const cy = hull.reduce((sum, point) => sum + point.y, 0) / hull.length;
  const segs = hull.map((a, i) => {
    const b = hull[(i + 1) % hull.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if (nx * (mx - cx) + ny * (my - cy) < 0) {
      nx = -nx;
      ny = -ny;
    }
    return {
      from: { x: a.x + nx * radius, y: a.y + ny * radius },
      to: { x: b.x + nx * radius, y: b.y + ny * radius },
    };
  });
  return `${segs
    .map((seg, i) => {
      const next = segs[(i + 1) % segs.length];
      const start = i === 0 ? `M ${seg.from.x} ${seg.from.y}` : '';
      return `${start} L ${seg.to.x} ${seg.to.y} A ${radius} ${radius} 0 0 1 ${next.from.x} ${next.from.y}`;
    })
    .join('')} Z`;
}

export function clusterHaloPath(centers: Vec[], pad = CLUSTER_PAD): { path: string; box: Box } {
  const points = uniquePoints(centers);
  if (!points.length) return { path: '', box: { x: 0, y: 0, width: 1, height: 1 } };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const box = {
    x: Math.min(...xs) - pad,
    y: Math.min(...ys) - pad,
    width: Math.max(...xs) - Math.min(...xs) + pad * 2,
    height: Math.max(...ys) - Math.min(...ys) + pad * 2,
  };
  if (points.length === 1) return { path: circlePath(points[0], pad), box };
  if (points.length === 2) return { path: stadiumPath(points[0], points[1], pad), box };
  return { path: roundedOffset(convexHull(points), pad), box };
}
