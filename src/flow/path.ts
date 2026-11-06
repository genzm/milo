import { FLOW, type FlowFrame, type FlowRoute } from './types.ts';
import {
  inflate,
  polylineHits,
  cubicControls,
  sampleCubic,
  sampleQuad,
  type Point,
  type Side,
} from './geometry.ts';

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

export function polylinePath(points: Point[]) {
  return {
    path: points
      .map((point, i) => (i === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`))
      .join(' '),
    label: labelFor(points),
  };
}

export function pathOf(points: Point[], route: FlowRoute, obstacles: FlowFrame[] = []) {
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
    return { path: curved.path, label: curveLabel(curved.samples) };
  }
  return polylinePath(points);
}

export function curveLabel(samples: Point[]): Point {
  const lengths = samples
    .slice(1)
    .map((p, i) => Math.hypot(p.x - samples[i].x, p.y - samples[i].y));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const t = lengths[i] ? remaining / lengths[i] : 0;
      return {
        x: samples[i].x + (samples[i + 1].x - samples[i].x) * t,
        y: samples[i].y + (samples[i + 1].y - samples[i].y) * t - 10,
      };
    }
    remaining -= lengths[i];
  }
  return samples[0];
}

export function roundedElbow(points: Point[]) {
  let path = `M ${points[0].x} ${points[0].y}`;
  const samples = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1],
      corner = points[i],
      next = points[i + 1];
    const before = Math.hypot(corner.x - prev.x, corner.y - prev.y);
    const after = Math.hypot(next.x - corner.x, next.y - corner.y);
    const radius = Math.min(16, before / 2, after / 2);
    if (!radius) continue;
    const entry = {
      x: corner.x + ((prev.x - corner.x) * radius) / before,
      y: corner.y + ((prev.y - corner.y) * radius) / before,
    };
    const exit = {
      x: corner.x + ((next.x - corner.x) * radius) / after,
      y: corner.y + ((next.y - corner.y) * radius) / after,
    };
    path += ` L ${entry.x} ${entry.y} Q ${corner.x} ${corner.y} ${exit.x} ${exit.y}`;
    samples.push(...sampleQuad(entry, corner, exit));
  }
  const end = points[points.length - 1];
  path += ` L ${end.x} ${end.y}`;
  samples.push(end);
  return { path, samples, label: curveLabel(samples) };
}

export function elbow(start: Point, end: Point, horizontalFirst: boolean): Point[] {
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

export function pickRoute(
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
    return pathOf(
      around(start, end, bounds, side),
      route === 'curve' ? 'curve' : 'elbow',
      obstacles,
    );
  const detour: Side[] =
    Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)
      ? ['bottom', 'top', 'right', 'left']
      : ['right', 'left', 'bottom', 'top'];
  const candidates = [
    elbow(start, end, true),
    elbow(start, end, false),
    ...detour.map((detourSide) => around(start, end, bounds, detourSide)),
  ];
  const clear = candidates.find((points) => !polylineHits(points, obstacles));
  return pathOf(clear || candidates[0], route === 'curve' ? 'curve' : 'elbow', obstacles);
}
