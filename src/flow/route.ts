import {
  FLOW,
  type FlowEdgePath,
  type FlowFrame,
  type FlowGraph,
  type FlowRoute,
} from './types.ts';

type Side = 'top' | 'right' | 'bottom' | 'left';
type Point = { x: number; y: number };

function portPoint(frame: FlowFrame, side: Side, t: number): Point {
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

function inflate(box: FlowFrame, pad: number): FlowFrame {
  return {
    x: box.x - pad,
    y: box.y - pad,
    width: box.width + pad * 2,
    height: box.height + pad * 2,
  };
}

function pointIn(box: FlowFrame, point: Point) {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  );
}

function segmentHits(a: Point, b: Point, box: FlowFrame) {
  if (pointIn(box, a) || pointIn(box, b)) return true;
  const x0 = box.x;
  const y0 = box.y;
  const x1 = box.x + box.width;
  const y1 = box.y + box.height;
  const sides: [Point, Point][] = [
    [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
    ],
    [
      { x: x1, y: y0 },
      { x: x1, y: y1 },
    ],
    [
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
    [
      { x: x0, y: y1 },
      { x: x0, y: y0 },
    ],
  ];
  return sides.some(([c, d]) => segmentsCross(a, b, c, d));
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point) {
  const side = (p: Point, q: Point, r: Point) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const ab1 = side(a, b, c);
  const ab2 = side(a, b, d);
  const cd1 = side(c, d, a);
  const cd2 = side(c, d, b);
  return ab1 * ab2 < 0 && cd1 * cd2 < 0;
}

function polylineHits(points: Point[], obstacles: FlowFrame[]) {
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

function cubicControls(start: Point, end: Point) {
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

function sampleCubic(p0: Point, c1: Point, c2: Point, p3: Point, steps = 12) {
  return Array.from({ length: steps + 1 }, (_, i) => cubicPoint(p0, c1, c2, p3, i / steps));
}

function sampleQuad(p0: Point, c1: Point, p2: Point, steps = 12) {
  return Array.from({ length: steps + 1 }, (_, i) => quadPoint(p0, c1, p2, i / steps));
}

function numbersOf(body: string) {
  return [...body.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
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

function curveFromPoints(points: Point[]) {
  if (points.length === 2) {
    const start = points[0];
    const end = points[1];
    const { c1, c2 } = cubicControls(start, end);
    return {
      path: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`,
      samples: sampleCubic(start, c1, c2, end),
    };
  }
  const padded = [points[0], ...points, points[points.length - 1]];
  let path = `M ${points[0].x} ${points[0].y}`;
  const samples: Point[] = [points[0]];
  for (let i = 1; i < padded.length - 2; i += 1) {
    const p0 = padded[i - 1];
    const p1 = padded[i];
    const p2 = padded[i + 1];
    const p3 = padded[i + 2];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    path += ` C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`;
    samples.push(...sampleCubic(p1, c1, c2, p2, 8).slice(1));
  }
  return { path, samples };
}

function labelFor(points: Point[]) {
  let best = 0;
  let bestLen = -1;
  for (let i = 0; i < points.length - 1; i += 1) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    if (len > bestLen) {
      best = i;
      bestLen = len;
    }
  }
  const a = points[best];
  const b = points[best + 1];
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  return {
    x: (a.x + b.x) / 2,
    y: horizontal ? Math.max(a.y, b.y) + 18 : (a.y + b.y) / 2 - 8,
  };
}

function polylinePath(points: Point[]) {
  return {
    path: points
      .map((point, i) => (i === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`))
      .join(' '),
    label: labelFor(points),
  };
}

function pathOf(points: Point[], route: FlowRoute, obstacles: FlowFrame[] = []) {
  if (points.length < 2) return { path: '', label: { x: 0, y: 0 } };
  if (route === 'straight') {
    return {
      path: `M ${points[0].x} ${points[0].y} L ${points[points.length - 1].x} ${points[points.length - 1].y}`,
      label: labelFor(points),
    };
  }
  if (route === 'curve') {
    const curved = curveFromPoints(points);
    if (obstacles.length && polylineHits(curved.samples, obstacles)) {
      return pathOf(points, points.length > 2 ? 'elbow' : 'straight');
    }
    return { path: curved.path, label: labelFor(points) };
  }
  return polylinePath(points);
}

function routeConnectionLegacy(start: Point, end: Point) {
  const curved = curveFromPoints([start, end]);
  return { path: curved.path, label: labelFor([start, end]) };
}

function sidesFor(graph: FlowGraph, feedback: boolean): { out: Side; inn: Side } {
  if (feedback) {
    if (graph.direction === 'right' || graph.direction === 'left')
      return { out: 'bottom', inn: 'bottom' };
    return { out: 'right', inn: 'right' };
  }
  if (graph.direction === 'right') return { out: 'right', inn: 'left' };
  if (graph.direction === 'left') return { out: 'left', inn: 'right' };
  if (graph.direction === 'down') return { out: 'bottom', inn: 'top' };
  return { out: 'top', inn: 'bottom' };
}

function elbow(start: Point, end: Point, horizontalFirst: boolean): Point[] {
  if (horizontalFirst) {
    const mid = (start.x + end.x) / 2;
    return [start, { x: mid, y: start.y }, { x: mid, y: end.y }, end];
  }
  const mid = (start.y + end.y) / 2;
  return [start, { x: start.x, y: mid }, { x: end.x, y: mid }, end];
}

function around(start: Point, end: Point, bounds: FlowFrame, side: Side): Point[] {
  const box = inflate(bounds, FLOW.FEEDBACK_PAD);
  if (side === 'bottom') {
    const y = box.y + box.height;
    return [start, { x: start.x, y }, { x: end.x, y }, end];
  }
  if (side === 'top') {
    const y = box.y;
    return [start, { x: start.x, y }, { x: end.x, y }, end];
  }
  if (side === 'right') {
    const x = box.x + box.width;
    return [start, { x, y: start.y }, { x, y: end.y }, end];
  }
  const x = box.x;
  return [start, { x, y: start.y }, { x, y: end.y }, end];
}

function graphBounds(frames: FlowFrame[]): FlowFrame {
  const xs = frames.map((frame) => frame.x);
  const ys = frames.map((frame) => frame.y);
  const rights = frames.map((frame) => frame.x + frame.width);
  const bottoms = frames.map((frame) => frame.y + frame.height);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...rights) - x, height: Math.max(...bottoms) - y };
}

export function routeConnection(from: FlowFrame, to: FlowFrame, route: FlowRoute) {
  const a = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const b = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const start = horizontal
    ? { x: a.x + (Math.sign(dx || 1) * from.width) / 2, y: a.y }
    : { x: a.x, y: a.y + (Math.sign(dy || 1) * from.height) / 2 };
  const end = horizontal
    ? { x: b.x - (Math.sign(dx || 1) * to.width) / 2, y: b.y }
    : { x: b.x, y: b.y - (Math.sign(dy || 1) * to.height) / 2 };
  if (route === 'elbow') return pathOf(elbow(start, end, horizontal), 'elbow');
  if (route === 'straight') return pathOf([start, end], 'straight');
  return routeConnectionLegacy(start, end);
}

function pickRoute(
  start: Point,
  end: Point,
  obstacles: FlowFrame[],
  route: FlowRoute,
  feedback: boolean,
  bounds: FlowFrame,
  side: Side,
) {
  const straight = [start, end];
  if (!feedback && !polylineHits(straight, obstacles)) {
    return pathOf(straight, route === 'elbow' ? 'straight' : route, obstacles);
  }
  if (feedback)
    return pathOf(around(start, end, bounds, side), route === 'curve' ? 'curve' : 'elbow', obstacles);
  const candidates = [
    elbow(start, end, true),
    elbow(start, end, false),
    around(start, end, bounds, side),
  ];
  const clear = candidates.find((points) => !polylineHits(points, obstacles));
  return pathOf(clear || candidates[0], route === 'curve' ? 'curve' : 'elbow', obstacles);
}

export function routeEdges(graph: FlowGraph, frames: Map<string, FlowFrame>): FlowEdgePath[] {
  const boxes = [...frames.values()];
  const bounds = boxes.length
    ? graphBounds(boxes)
    : { x: 0, y: 0, width: graph.width, height: graph.height };
  const ports = new Map<string, number>();
  const bump = (key: string) => {
    const next = (ports.get(key) || 0) + 1;
    ports.set(key, next);
    return next;
  };
  const totals = new Map<string, number>();
  for (const edge of graph.edges) {
    const from = frames.get(edge.from);
    const to = frames.get(edge.to);
    if (!from || !to) continue;
    const sides = sidesFor(graph, Boolean(edge.feedback));
    totals.set(`${edge.from}:${sides.out}`, (totals.get(`${edge.from}:${sides.out}`) || 0) + 1);
    totals.set(`${edge.to}:${sides.inn}`, (totals.get(`${edge.to}:${sides.inn}`) || 0) + 1);
  }
  return graph.edges.flatMap((edge) => {
    const from = frames.get(edge.from);
    const to = frames.get(edge.to);
    if (!from || !to) return [];
    const sides = sidesFor(graph, Boolean(edge.feedback));
    const outTotal = totals.get(`${edge.from}:${sides.out}`) || 1;
    const inTotal = totals.get(`${edge.to}:${sides.inn}`) || 1;
    const outIndex = bump(`${edge.from}:${sides.out}:i`);
    const inIndex = bump(`${edge.to}:${sides.inn}:i`);
    const start = portPoint(from, sides.out, outIndex / (outTotal + 1));
    const end = portPoint(to, sides.inn, inIndex / (inTotal + 1));
    const obstacles = boxes
      .filter((box) => box !== from && box !== to)
      .map((box) => inflate(box, 8));
    const geometry = pickRoute(
      start,
      end,
      obstacles,
      edge.route || graph.route,
      Boolean(edge.feedback),
      bounds,
      sides.out,
    );
    return [{ from: edge.from, to: edge.to, ...geometry }];
  });
}

export function edgeHitsNode(path: string, box: FlowFrame) {
  return polylineHits(samplePath(path), [inflate(box, 1)]);
}
