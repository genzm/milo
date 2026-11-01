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
