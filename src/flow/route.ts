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

function pathOf(points: Point[], route: FlowRoute) {
  if (points.length < 2) return { path: '', label: { x: 0, y: 0 } };
  const label = labelFor(points);
  if (route === 'straight' || points.length === 2) {
    return {
      path: `M ${points[0].x} ${points[0].y} L ${points[points.length - 1].x} ${points[points.length - 1].y}`,
      label,
    };
  }
  if (route === 'curve' && points.length === 2) {
    return routeConnectionLegacy(points[0], points[1]);
  }
  if (route === 'curve') {
    const start = points[0];
    const end = points[points.length - 1];
    const via = points[Math.floor(points.length / 2)];
    return {
      path: `M ${start.x} ${start.y} Q ${via.x} ${via.y} ${end.x} ${end.y}`,
      label,
    };
  }
  const commands = points.map((point, i) =>
    i === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`,
  );
  return { path: commands.join(' '), label };
}

function routeConnectionLegacy(start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const bend = horizontal ? Math.max(35, Math.abs(dx) * 0.42) : Math.max(35, Math.abs(dy) * 0.42);
  const path = horizontal
    ? `M ${start.x} ${start.y} C ${start.x + Math.sign(dx || 1) * bend} ${start.y}, ${end.x - Math.sign(dx || 1) * bend} ${end.y}, ${end.x} ${end.y}`
    : `M ${start.x} ${start.y} C ${start.x} ${start.y + Math.sign(dy || 1) * bend}, ${end.x} ${end.y - Math.sign(dy || 1) * bend}, ${end.x} ${end.y}`;
  return { path, label: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 8 } };
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
    return pathOf(straight, route === 'elbow' ? 'straight' : route);
  }
  if (feedback)
    return pathOf(around(start, end, bounds, side), route === 'curve' ? 'curve' : 'elbow');
  const candidates = [
    elbow(start, end, true),
    elbow(start, end, false),
    around(start, end, bounds, side),
  ];
  const clear = candidates.find((points) => !polylineHits(points, obstacles));
  return pathOf(clear || candidates[0], route === 'curve' ? 'curve' : 'elbow');
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
  const points = [...path.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
  }));
  return polylineHits(points, [inflate(box, 1)]);
}
