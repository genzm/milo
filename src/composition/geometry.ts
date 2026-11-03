import type { AnnotationDirection, AnnotationSide } from '../markdown/composition.mjs';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}
const center = (box: Box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
function commonAxis(a: number, lengthA: number, b: number, lengthB: number) {
  const low = Math.max(a, b),
    high = Math.min(a + lengthA, b + lengthB);
  return high >= low ? (low + high) / 2 : undefined;
}

// Overlapping projections share a straight axis, even when centers differ.
export function betweenBoxes(from: Box, to: Box, padding = 12): [Point, Point] {
  const a = center(from),
    b = center(to);
  const horizontalGap = Math.abs(b.x - a.x) - (from.width + to.width) / 2 - padding * 2;
  const verticalGap = Math.abs(b.y - a.y) - (from.height + to.height) / 2 - padding * 2;
  const horizontal =
    horizontalGap >= 8 && (verticalGap < 8 || Math.abs(b.x - a.x) >= Math.abs(b.y - a.y));
  if (horizontal) {
    const sign = b.x >= a.x ? 1 : -1;
    if (Math.abs(b.x - a.x) - (from.width + to.width) / 2 - padding * 2 < 8)
      throw new Error('解説矢印の余白が足りません。compose の gap を広げてください。');
    const y = commonAxis(from.y, from.height, to.y, to.height);
    return [
      { x: a.x + sign * (from.width / 2 + padding), y: y ?? a.y },
      { x: b.x - sign * (to.width / 2 + padding), y: y ?? b.y },
    ];
  }
  const sign = b.y >= a.y ? 1 : -1;
  if (Math.abs(b.y - a.y) - (from.height + to.height) / 2 - padding * 2 < 8)
    throw new Error('解説矢印の余白が足りません。compose の gap を広げてください。');
  const x = commonAxis(from.x, from.width, to.x, to.width);
  return [
    { x: x ?? a.x, y: a.y + sign * (from.height / 2 + padding) },
    { x: x ?? b.x, y: b.y - sign * (to.height / 2 + padding) },
  ];
}

export function besideBox(
  box: Box,
  side: AnnotationSide,
  direction: AnnotationDirection,
  size: number,
  offset: number,
): [Point, Point] {
  const distance = size / 2 + offset;
  const horizontal = side === 'top' || side === 'bottom';
  const fixed =
    side === 'top'
      ? box.y - distance
      : side === 'bottom'
        ? box.y + box.height + distance
        : side === 'left'
          ? box.x - distance
          : box.x + box.width + distance;
  const points: [Point, Point] = horizontal
    ? [
        { x: box.x, y: fixed },
        { x: box.x + box.width, y: fixed },
      ]
    : [
        { x: fixed, y: box.y },
        { x: fixed, y: box.y + box.height },
      ];
  return direction === 'left' || direction === 'up' ? [points[1], points[0]] : points;
}

export function arrowGeometry(from: Point, to: Point, size: number) {
  const dx = to.x - from.x,
    dy = to.y - from.y,
    length = Math.hypot(dx, dy);
  if (length < 8) throw new Error('解説矢印の余白が足りません。compose の gap を広げてください。');
  const ux = dx / length,
    uy = dy / length;
  const half = Math.min(size / 2, length * 0.45),
    shaft = half * 0.48;
  const head = Math.min(half * 1.1, length * 0.4);
  const point = (x: number, y: number) => ({
    x: from.x + ux * x - uy * y,
    y: from.y + uy * x + ux * y,
  });
  const points = [
    [0, -shaft],
    [length - head, -shaft],
    [length - head, -half],
    [length, 0],
    [length - head, half],
    [length - head, shaft],
    [0, shaft],
  ].map(([x, y]) => point(x, y));
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  return {
    path: points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ') + ' Z',
    box: {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    },
    label: point((length - head) / 2, 0),
    length: length - head,
    vertical: Math.abs(dy) > Math.abs(dx),
  };
}

export function crossGeometry(target: Box, scale = 1, size?: number) {
  const c = center(target);
  const width = size ?? Math.max(100, target.width * scale);
  const height = size ? size * 0.65 : Math.max(100, target.height * scale);
  const stroke = Math.max(12, Math.min(width, height) * 0.16);
  const x = c.x - width / 2 + stroke / 2,
    y = c.y - height / 2 + stroke / 2;
  const right = c.x + width / 2 - stroke / 2,
    bottom = c.y + height / 2 - stroke / 2;
  return { path: `M ${x} ${y} L ${right} ${bottom} M ${right} ${y} L ${x} ${bottom}`, stroke };
}
