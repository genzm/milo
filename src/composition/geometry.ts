import type {
  AnnotationArrows,
  AnnotationDirection,
  AnnotationSide,
} from '../markdown/composition.mjs';

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

// Keep a straight corridor, but prefer a box center that still sits in the
// overlap so a pointed arrow does not sit on a leftover sliver.
function sharedAxis(from: Box, to: Box, start: 'x' | 'y', size: 'width' | 'height') {
  const a0 = from[start],
    a1 = a0 + from[size],
    b0 = to[start],
    b1 = b0 + to[size];
  const low = Math.max(a0, b0),
    high = Math.min(a1, b1);
  if (high < low) return undefined;
  const aMid = a0 + from[size] / 2,
    bMid = b0 + to[size] / 2;
  const fits = (mid: number) => mid >= low - 1e-6 && mid <= high + 1e-6;
  if (fits(aMid)) return aMid;
  if (fits(bMid)) return bMid;
  return (low + high) / 2;
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
    const y = sharedAxis(from, to, 'y', 'height');
    return [
      { x: a.x + sign * (from.width / 2 + padding), y: y ?? a.y },
      { x: b.x - sign * (to.width / 2 + padding), y: y ?? b.y },
    ];
  }
  const sign = b.y >= a.y ? 1 : -1;
  if (Math.abs(b.y - a.y) - (from.height + to.height) / 2 - padding * 2 < 8)
    throw new Error('解説矢印の余白が足りません。compose の gap を広げてください。');
  const x = sharedAxis(from, to, 'x', 'width');
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

function overlapsRange(start: number, span: number, from: number, to: number) {
  return start < to && start + span > from;
}

// Parallel overlay along the layer between two nodes. Horizontal arrows span
// the union of the endpoints and sit at the nearest clearance past obstacles
// in that band. Vertical arrows cover the endpoints' heights and sit on the
// far left or right of the whole figure.
export function besideSpan(
  from: Box,
  to: Box,
  side: AnnotationSide,
  direction: AnnotationDirection,
  size: number,
  offset: number,
  obstacles: readonly Box[] = [],
): [Point, Point] {
  const bodies = obstacles.length > 0 ? [...obstacles, from, to] : [from, to];
  const distance = size / 2 + offset;
  if (side === 'top' || side === 'bottom') {
    const x0 = Math.min(from.x, to.x);
    const x1 = Math.max(from.x + from.width, to.x + to.width);
    const hits = bodies.filter((box) => overlapsRange(box.x, box.width, x0, x1));
    const cloud = hits.length > 0 ? hits : [from, to];
    const y =
      side === 'top'
        ? Math.min(...cloud.map((box) => box.y)) - distance
        : Math.max(...cloud.map((box) => box.y + box.height)) + distance;
    const points: [Point, Point] = [
      { x: x0, y },
      { x: x1, y },
    ];
    return direction === 'left' ? [points[1], points[0]] : points;
  }
  const y0 = Math.min(from.y, to.y);
  const y1 = Math.max(from.y + from.height, to.y + to.height);
  const x =
    side === 'left'
      ? Math.min(...bodies.map((box) => box.x)) - distance
      : Math.max(...bodies.map((box) => box.x + box.width)) + distance;
  const points: [Point, Point] = [
    { x, y: y0 },
    { x, y: y1 },
  ];
  return direction === 'up' ? [points[1], points[0]] : points;
}

export function arrowGeometry(
  from: Point,
  to: Point,
  size: number,
  arrows: AnnotationArrows = 'end',
) {
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
  const start = arrows === 'both' ? head : 0;
  const outline =
    arrows === 'both'
      ? [
          [0, 0],
          [head, -half],
          [head, -shaft],
        ]
      : [[0, -shaft]];
  outline.push(
    [length - head, -shaft],
    [length - head, -half],
    [length, 0],
    [length - head, half],
    [length - head, shaft],
    [start, shaft],
  );
  if (arrows === 'both') outline.push([head, half]);
  const points = outline.map(([x, y]) => point(x, y));
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
    label: point((start + length - head) / 2, 0),
    length: length - head - start,
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
