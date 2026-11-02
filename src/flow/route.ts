import {
  FLOW,
  type FlowArrows,
  type FlowEdge,
  type FlowEdgePath,
  type FlowFrame,
  type FlowGraph,
  type FlowRoute,
} from './types.ts';

import { portPoint, inflate, graphBounds, type Point, type Side } from './geometry.ts';
import { polylinePath, pathOf, elbow, pickRoute } from './path.ts';

export { routeFreeEdges } from './route-free.ts';
export { edgeHitsNode } from './geometry.ts';

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

function alongFlow(graph: FlowGraph) {
  return graph.direction === 'right' || graph.direction === 'left';
}

function flowSign(graph: FlowGraph) {
  return graph.direction === 'right' || graph.direction === 'down' ? 1 : -1;
}

function exitPrimary(frame: FlowFrame, graph: FlowGraph) {
  if (graph.direction === 'right') return frame.x + frame.width;
  if (graph.direction === 'left') return frame.x;
  if (graph.direction === 'down') return frame.y + frame.height;
  return frame.y;
}

function enterPrimary(frame: FlowFrame, graph: FlowGraph) {
  if (graph.direction === 'right') return frame.x;
  if (graph.direction === 'left') return frame.x + frame.width;
  if (graph.direction === 'down') return frame.y;
  return frame.y + frame.height;
}

function crossOf(frame: FlowFrame, graph: FlowGraph) {
  return alongFlow(graph) ? frame.y + frame.height / 2 : frame.x + frame.width / 2;
}

function pointAt(primary: number, cross: number, graph: FlowGraph): Point {
  return alongFlow(graph) ? { x: primary, y: cross } : { x: cross, y: primary };
}

function collapsePoints(points: Point[]) {
  const next: Point[] = [];
  for (const point of points) {
    const last = next[next.length - 1];
    if (last && Math.abs(last.x - point.x) < 0.5 && Math.abs(last.y - point.y) < 0.5) continue;
    const prev = next[next.length - 2];
    if (
      prev &&
      last &&
      Math.abs((last.x - prev.x) * (point.y - last.y) - (last.y - prev.y) * (point.x - last.x)) <
        0.5
    ) {
      next[next.length - 1] = point;
      continue;
    }
    next.push(point);
  }
  return next;
}

function trunkOffset(span: number) {
  if (span < FLOW.TRUNK_MIN + 8) return undefined;
  return Math.min(FLOW.TRUNK_MAX, Math.max(FLOW.TRUNK_MIN, span * 0.38));
}

function usesAuto(edge: FlowEdge, graph: FlowGraph) {
  return (edge.route || graph.route) === 'auto';
}

function boundaryArrow(edge: FlowEdge, side: 'start' | 'end'): FlowArrows {
  const arrows = edge.arrows ?? 'end';
  return arrows === side || arrows === 'both' ? side : 'none';
}

function emitPath(
  paths: FlowEdgePath[],
  edge: FlowEdge,
  points: Point[],
  role: NonNullable<FlowEdgePath['role']>,
  arrows?: FlowArrows,
) {
  const collapsed = collapsePoints(points);
  if (collapsed.length < 2) return;
  paths.push({
    index: edge.index,
    from: edge.from,
    to: edge.to,
    ...polylinePath(collapsed),
    arrows,
    role,
  });
}

function emitFanOut(
  graph: FlowGraph,
  frames: Map<string, FlowFrame>,
  edges: FlowEdge[],
  paths: FlowEdgePath[],
) {
  const source = frames.get(edges[0].from);
  if (!source) return false;
  const targets = edges.map((edge) => frames.get(edge.to)).filter(Boolean) as FlowFrame[];
  if (targets.length < 2) return false;
  const sign = flowSign(graph);
  const outP = exitPrimary(source, graph);
  const inP =
    sign > 0
      ? Math.min(...targets.map((frame) => enterPrimary(frame, graph)))
      : Math.max(...targets.map((frame) => enterPrimary(frame, graph)));
  const offset = trunkOffset((inP - outP) * sign);
  if (offset === undefined) return false;
  const trunk = outP + sign * offset;
  const sourceCross = crossOf(source, graph);
  const crosses = targets.map((frame) => crossOf(frame, graph));
  const busCrosses = [sourceCross, ...crosses];
  emitPath(
    paths,
    edges[0],
    [pointAt(outP, sourceCross, graph), pointAt(trunk, sourceCross, graph)],
    'stem',
    edges.some((edge) => boundaryArrow(edge, 'start') === 'start') ? 'start' : 'none',
  );
  if (Math.max(...busCrosses) - Math.min(...busCrosses) > 1) {
    emitPath(
      paths,
      edges[0],
      [
        pointAt(trunk, Math.min(...busCrosses), graph),
        pointAt(trunk, Math.max(...busCrosses), graph),
      ],
      'bus',
      'none',
    );
  }
  edges.forEach((edge, i) => {
    const target = targets[i];
    const cross = crosses[i];
    emitPath(
      paths,
      edge,
      [pointAt(trunk, cross, graph), pointAt(enterPrimary(target, graph), cross, graph)],
      'stub',
      boundaryArrow(edge, 'end'),
    );
  });
  return true;
}

function emitFanIn(
  graph: FlowGraph,
  frames: Map<string, FlowFrame>,
  edges: FlowEdge[],
  paths: FlowEdgePath[],
) {
  const target = frames.get(edges[0].to);
  if (!target) return false;
  const sources = edges.map((edge) => frames.get(edge.from)).filter(Boolean) as FlowFrame[];
  if (sources.length < 2) return false;
  const sign = flowSign(graph);
  const outP =
    sign > 0
      ? Math.max(...sources.map((frame) => exitPrimary(frame, graph)))
      : Math.min(...sources.map((frame) => exitPrimary(frame, graph)));
  const inP = enterPrimary(target, graph);
  const offset = trunkOffset((inP - outP) * sign);
  if (offset === undefined) return false;
  const trunk = inP - sign * offset;
  const targetCross = crossOf(target, graph);
  const crosses = sources.map((frame) => crossOf(frame, graph));
  const busCrosses = [targetCross, ...crosses];
  edges.forEach((edge, i) => {
    const source = sources[i];
    const cross = crosses[i];
    emitPath(
      paths,
      edge,
      [pointAt(exitPrimary(source, graph), cross, graph), pointAt(trunk, cross, graph)],
      'stub',
      boundaryArrow(edge, 'start'),
    );
  });
  if (Math.max(...busCrosses) - Math.min(...busCrosses) > 1) {
    emitPath(
      paths,
      edges[0],
      [
        pointAt(trunk, Math.min(...busCrosses), graph),
        pointAt(trunk, Math.max(...busCrosses), graph),
      ],
      'bus',
      'none',
    );
  }
  emitPath(
    paths,
    edges[0],
    [pointAt(trunk, targetCross, graph), pointAt(inP, targetCross, graph)],
    'stem',
    edges.some((edge) => boundaryArrow(edge, 'end') === 'end') ? 'end' : 'none',
  );
  return true;
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
  if (route === 'straight' || route === 'auto') return pathOf([start, end], 'straight');
  return pathOf([start, end], 'curve');
}

function routeLegacy(
  graph: FlowGraph,
  frames: Map<string, FlowFrame>,
  skip = new Set<number>(),
): FlowEdgePath[] {
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
    if (skip.has(edge.index)) continue;
    const from = frames.get(edge.from);
    const to = frames.get(edge.to);
    if (!from || !to) continue;
    const sides = sidesFor(graph, Boolean(edge.feedback));
    totals.set(`${edge.from}:${sides.out}`, (totals.get(`${edge.from}:${sides.out}`) || 0) + 1);
    totals.set(`${edge.to}:${sides.inn}`, (totals.get(`${edge.to}:${sides.inn}`) || 0) + 1);
  }
  return graph.edges.flatMap((edge, index) => {
    if (skip.has(edge.index ?? index)) return [];
    const from = frames.get(edge.from);
    const to = frames.get(edge.to);
    if (!from || !to) return [];
    const edgeIndex = edge.index ?? index;
    const sides = sidesFor(graph, Boolean(edge.feedback));
    const pairCount = graph.edges.filter(
      (item) => item.from === edge.from && item.to === edge.to && !skip.has(item.index),
    ).length;
    const centered = usesAuto(edge, graph) && !edge.feedback && pairCount === 1;
    const outTotal = centered ? 1 : totals.get(`${edge.from}:${sides.out}`) || 1;
    const inTotal = centered ? 1 : totals.get(`${edge.to}:${sides.inn}`) || 1;
    const outIndex = centered ? 1 : bump(`${edge.from}:${sides.out}:i`);
    const inIndex = centered ? 1 : bump(`${edge.to}:${sides.inn}:i`);
    const start = portPoint(from, sides.out, outIndex / (outTotal + 1));
    const end = portPoint(to, sides.inn, inIndex / (inTotal + 1));
    const obstacles = boxes
      .filter((box) => box !== from && box !== to)
      .map((box) => inflate(box, 8));
    const requested = edge.route || graph.route;
    const geometry = pickRoute(
      start,
      end,
      obstacles,
      requested === 'auto' ? 'straight' : requested,
      Boolean(edge.feedback),
      bounds,
      sides.out,
    );
    return [{ index: edgeIndex, from: edge.from, to: edge.to, ...geometry, role: 'edge' as const }];
  });
}

function routeAuto(graph: FlowGraph, frames: Map<string, FlowFrame>): FlowEdgePath[] {
  const paths: FlowEdgePath[] = [];
  const assigned = new Set<number>();
  const eligible = graph.edges.filter((edge) => usesAuto(edge, graph) && !edge.feedback);
  const byFrom = new Map<string, FlowEdge[]>();
  for (const edge of eligible) {
    const group = byFrom.get(edge.from) || [];
    group.push(edge);
    byFrom.set(edge.from, group);
  }
  for (const edges of byFrom.values()) {
    if (new Set(edges.map((edge) => edge.to)).size < 2) continue;
    if (emitFanOut(graph, frames, edges, paths)) edges.forEach((edge) => assigned.add(edge.index));
  }
  const byTo = new Map<string, FlowEdge[]>();
  for (const edge of eligible) {
    if (assigned.has(edge.index)) continue;
    const group = byTo.get(edge.to) || [];
    group.push(edge);
    byTo.set(edge.to, group);
  }
  for (const edges of byTo.values()) {
    if (new Set(edges.map((edge) => edge.from)).size < 2) continue;
    if (emitFanIn(graph, frames, edges, paths)) edges.forEach((edge) => assigned.add(edge.index));
  }
  return [...paths, ...routeLegacy(graph, frames, assigned)];
}

export function routeEdges(graph: FlowGraph, frames: Map<string, FlowFrame>): FlowEdgePath[] {
  if (graph.edges.some((edge) => usesAuto(edge, graph))) return routeAuto(graph, frames);
  return routeLegacy(graph, frames);
}
