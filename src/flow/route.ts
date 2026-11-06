import {
  FLOW,
  type FlowArrows,
  type FlowEdge,
  type FlowEdgePath,
  type FlowFrame,
  type FlowGraph,
  type FlowRoute,
} from './types.ts';

import {
  portPoint,
  inflate,
  graphBounds,
  polylineHits,
  type Point,
  type Side,
} from './geometry.ts';
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
  if (span < 8) return undefined;
  const preferred = Math.min(FLOW.TRUNK_MAX, Math.max(FLOW.TRUNK_MIN, span * 0.38));
  if (preferred + 4 <= span) return preferred;
  return span / 2;
}

function usesAuto(edge: FlowEdge, graph: FlowGraph) {
  return (edge.route || graph.route) === 'auto';
}

function boundaryArrow(edge: FlowEdge, side: 'start' | 'end'): FlowArrows {
  const arrows = edge.arrows ?? 'end';
  return arrows === side || arrows === 'both' ? side : 'none';
}

function gapLabel(graph: FlowGraph, fromP: number, toP: number, cross: number) {
  return pointAt((fromP + toP) / 2, cross - 14, graph);
}

function emitPath(
  paths: FlowEdgePath[],
  edge: FlowEdge,
  points: Point[],
  role: NonNullable<FlowEdgePath['role']>,
  arrows?: FlowArrows,
  label?: Point,
) {
  const collapsed = collapsePoints(points);
  if (collapsed.length < 2) return;
  const geometry = polylinePath(collapsed);
  paths.push({
    index: edge.index,
    from: edge.from,
    to: edge.to,
    ...geometry,
    label: label ?? geometry.label,
    arrows,
    role,
  });
}

function sameColumn(a: number, b: number) {
  return Math.abs(a - b) < 1;
}

function nearestEnter(graph: FlowGraph, frames: Map<string, FlowFrame>, edges: FlowEdge[]) {
  const sign = flowSign(graph);
  const values = edges.map((edge) => enterPrimary(frames.get(edge.to)!, graph));
  return sign > 0 ? Math.min(...values) : Math.max(...values);
}

function nearestExit(graph: FlowGraph, frames: Map<string, FlowFrame>, edges: FlowEdge[]) {
  const sign = flowSign(graph);
  const values = edges.map((edge) => exitPrimary(frames.get(edge.from)!, graph));
  return sign > 0 ? Math.max(...values) : Math.min(...values);
}

function splitByColumn(edges: FlowEdge[], column: number, primaryOf: (edge: FlowEdge) => number) {
  const local: FlowEdge[] = [];
  const skip: FlowEdge[] = [];
  for (const edge of edges) (sameColumn(primaryOf(edge), column) ? local : skip).push(edge);
  return { local, skip };
}

function emitFanOut(
  graph: FlowGraph,
  frames: Map<string, FlowFrame>,
  edges: FlowEdge[],
  skipBypass: Map<number, number>,
  paths: FlowEdgePath[],
) {
  const source = frames.get(edges[0].from);
  if (!source) return false;
  const unique = new Set(edges.map((edge) => edge.to));
  if (unique.size < 2) return false;
  const sign = flowSign(graph);
  const outP = exitPrimary(source, graph);
  const inP = nearestEnter(graph, frames, edges);
  const offset = trunkOffset((inP - outP) * sign);
  if (offset === undefined) return false;
  const { local, skip } = splitByColumn(edges, inP, (edge) =>
    enterPrimary(frames.get(edge.to)!, graph),
  );
  const trunk = outP + sign * offset;
  const sourceCross = crossOf(source, graph);
  const localCrosses = local.map((edge) => crossOf(frames.get(edge.to)!, graph));
  const skipCrosses = skip
    .map((edge) => skipBypass.get(edge.index))
    .filter((value): value is number => value !== undefined);
  const busCrosses = [sourceCross, ...localCrosses, ...skipCrosses];
  const owner = local[0] || edges[0];
  emitPath(
    paths,
    owner,
    [pointAt(outP, sourceCross, graph), pointAt(trunk, sourceCross, graph)],
    'stem',
    edges.some((edge) => boundaryArrow(edge, 'start') === 'start') ? 'start' : 'none',
  );
  if (Math.max(...busCrosses) - Math.min(...busCrosses) > 1) {
    emitPath(
      paths,
      owner,
      [
        pointAt(trunk, Math.min(...busCrosses), graph),
        pointAt(trunk, Math.max(...busCrosses), graph),
      ],
      'bus',
      'none',
    );
  }
  for (const edge of local) {
    const target = frames.get(edge.to)!;
    const cross = crossOf(target, graph);
    emitPath(
      paths,
      edge,
      [pointAt(trunk, cross, graph), pointAt(enterPrimary(target, graph), cross, graph)],
      'stub',
      boundaryArrow(edge, 'end'),
      edge.label ? gapLabel(graph, outP, inP, cross) : undefined,
    );
  }
  return true;
}

function crossSpan(frame: FlowFrame, graph: FlowGraph) {
  if (alongFlow(graph)) return { min: frame.y, max: frame.y + frame.height };
  return { min: frame.x, max: frame.x + frame.width };
}

function nearerIncoming(graph: FlowGraph, frames: Map<string, FlowFrame>, edges: FlowEdge[]) {
  const sign = flowSign(graph);
  return edges.reduce((best, edge) => {
    const frame = frames.get(edge.from);
    const other = frames.get(best.from);
    if (!frame) return best;
    if (!other) return edge;
    const a = exitPrimary(frame, graph);
    const b = exitPrimary(other, graph);
    return sign > 0 === a > b ? edge : best;
  });
}

function pickBypass(
  graph: FlowGraph,
  source: FlowFrame,
  target: FlowFrame,
  frames: Map<string, FlowFrame>,
  fromP: number,
  toP: number,
) {
  const natural = crossOf(source, graph);
  const obstacles = [...frames.values()]
    .filter((box) => box !== source && box !== target)
    .map((box) => inflate(box, 8));
  const tryLane = (cross: number) =>
    !polylineHits(
      [pointAt(fromP, natural, graph), pointAt(fromP, cross, graph), pointAt(toP, cross, graph)],
      obstacles,
    );
  if (tryLane(natural)) return natural;
  const pad = FLOW.MIN_GAP;
  const hits = obstacles.filter((box) =>
    polylineHits([pointAt(fromP, natural, graph), pointAt(toP, natural, graph)], [box]),
  );
  const candidates = [...hits, source].flatMap((box) => {
    const span = crossSpan(box, graph);
    return [span.max + pad, span.min - pad];
  });
  const lanes = [...new Set(candidates.map((value) => Math.round(value * 10) / 10))].sort(
    (a, b) => {
      const delta = Math.abs(a - natural) - Math.abs(b - natural);
      return delta || b - a;
    },
  );
  for (const bypass of lanes) if (tryLane(bypass)) return bypass;
  return natural;
}

function stubToTrunk(
  graph: FlowGraph,
  source: FlowFrame,
  target: FlowFrame,
  frames: Map<string, FlowFrame>,
  trunk: number,
) {
  const startP = exitPrimary(source, graph);
  const bypass = pickBypass(graph, source, target, frames, startP, trunk);
  const natural = crossOf(source, graph);
  return {
    points: [
      pointAt(startP, natural, graph),
      pointAt(startP, bypass, graph),
      pointAt(trunk, bypass, graph),
    ],
    cross: bypass,
  };
}

function emitFanIn(
  graph: FlowGraph,
  frames: Map<string, FlowFrame>,
  edges: FlowEdge[],
  sourceTrunks: Map<string, number>,
  skipBypass: Map<number, number>,
  paths: FlowEdgePath[],
) {
  const target = frames.get(edges[0].to);
  if (!target) return false;
  const sources = edges.map((edge) => frames.get(edge.from)).filter(Boolean) as FlowFrame[];
  if (sources.length < 2) return false;
  const sign = flowSign(graph);
  const outP = nearestExit(graph, frames, edges);
  const inP = enterPrimary(target, graph);
  const offset = trunkOffset((inP - outP) * sign);
  if (offset === undefined) return false;
  const trunk = inP - sign * offset;
  const targetCross = crossOf(target, graph);
  const { local, skip } = splitByColumn(edges, outP, (edge) =>
    exitPrimary(frames.get(edge.from)!, graph),
  );
  const stubs = [
    ...local.map((edge) => {
      const source = frames.get(edge.from)!;
      const routed = stubToTrunk(graph, source, target, frames, trunk);
      return { edge, ...routed, startArrow: boundaryArrow(edge, 'start') };
    }),
    ...skip.map((edge) => {
      const source = frames.get(edge.from)!;
      const bypass = skipBypass.get(edge.index) ?? crossOf(source, graph);
      const fromP = sourceTrunks.get(edge.from) ?? exitPrimary(source, graph);
      return {
        edge,
        points: [pointAt(fromP, bypass, graph), pointAt(trunk, bypass, graph)],
        cross: bypass,
        startArrow: sourceTrunks.has(edge.from) ? ('none' as const) : boundaryArrow(edge, 'start'),
      };
    }),
  ];
  const busCrosses = [targetCross, ...stubs.map((stub) => stub.cross)];
  const owner = nearerIncoming(graph, frames, local.length ? local : edges);
  for (const stub of stubs) {
    emitPath(
      paths,
      stub.edge,
      stub.points,
      'stub',
      stub.startArrow,
      stub.edge.label ? gapLabel(graph, outP, inP, stub.cross) : undefined,
    );
  }
  if (Math.max(...busCrosses) - Math.min(...busCrosses) > 1) {
    emitPath(
      paths,
      owner,
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
    owner,
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
  const sign = flowSign(graph);
  const byFrom = new Map<string, FlowEdge[]>();
  for (const edge of eligible) {
    const group = byFrom.get(edge.from) || [];
    group.push(edge);
    byFrom.set(edge.from, group);
  }
  const sourceTrunks = new Map<string, number>();
  const fanOuts: FlowEdge[][] = [];
  const fanOutLocal = new Set<number>();
  for (const outgoing of byFrom.values()) {
    if (new Set(outgoing.map((edge) => edge.to)).size < 2) continue;
    const source = frames.get(outgoing[0].from);
    if (!source) continue;
    const inP = nearestEnter(graph, frames, outgoing);
    const outP = exitPrimary(source, graph);
    const offset = trunkOffset((inP - outP) * sign);
    if (offset === undefined) continue;
    sourceTrunks.set(outgoing[0].from, outP + sign * offset);
    fanOuts.push(outgoing);
    for (const edge of splitByColumn(outgoing, inP, (item) =>
      enterPrimary(frames.get(item.to)!, graph),
    ).local)
      fanOutLocal.add(edge.index);
  }
  const byTo = new Map<string, FlowEdge[]>();
  for (const edge of eligible) {
    if (fanOutLocal.has(edge.index)) continue;
    const group = byTo.get(edge.to) || [];
    group.push(edge);
    byTo.set(edge.to, group);
  }
  const destTrunks = new Map<string, number>();
  const fanIns: FlowEdge[][] = [];
  for (const incoming of byTo.values()) {
    if (new Set(incoming.map((edge) => edge.from)).size < 2) continue;
    const target = frames.get(incoming[0].to);
    if (!target) continue;
    const outP = nearestExit(graph, frames, incoming);
    const inP = enterPrimary(target, graph);
    const offset = trunkOffset((inP - outP) * sign);
    if (offset === undefined) continue;
    destTrunks.set(incoming[0].to, inP - sign * offset);
    fanIns.push(incoming);
  }
  const skipBypass = new Map<number, number>();
  for (const outgoing of fanOuts) {
    const source = frames.get(outgoing[0].from)!;
    const fromP = sourceTrunks.get(outgoing[0].from)!;
    const inP = nearestEnter(graph, frames, outgoing);
    const { skip } = splitByColumn(outgoing, inP, (edge) =>
      enterPrimary(frames.get(edge.to)!, graph),
    );
    for (const edge of skip) {
      const target = frames.get(edge.to)!;
      const toP = destTrunks.get(edge.to) ?? enterPrimary(target, graph);
      skipBypass.set(edge.index, pickBypass(graph, source, target, frames, fromP, toP));
    }
  }
  for (const incoming of fanIns) {
    const outP = nearestExit(graph, frames, incoming);
    const { skip } = splitByColumn(incoming, outP, (edge) =>
      exitPrimary(frames.get(edge.from)!, graph),
    );
    for (const edge of skip) {
      if (skipBypass.has(edge.index)) continue;
      const source = frames.get(edge.from)!;
      const target = frames.get(edge.to)!;
      const fromP = sourceTrunks.get(edge.from) ?? exitPrimary(source, graph);
      const toP = destTrunks.get(edge.to)!;
      skipBypass.set(edge.index, pickBypass(graph, source, target, frames, fromP, toP));
    }
  }
  for (const outgoing of fanOuts) {
    const inP = nearestEnter(graph, frames, outgoing);
    const { local } = splitByColumn(outgoing, inP, (edge) =>
      enterPrimary(frames.get(edge.to)!, graph),
    );
    if (emitFanOut(graph, frames, outgoing, skipBypass, paths))
      local.forEach((edge) => assigned.add(edge.index));
  }
  for (const incoming of fanIns) {
    if (emitFanIn(graph, frames, incoming, sourceTrunks, skipBypass, paths))
      incoming.forEach((edge) => assigned.add(edge.index));
  }
  for (const outgoing of fanOuts) {
    const source = frames.get(outgoing[0].from)!;
    const fromP = sourceTrunks.get(outgoing[0].from)!;
    const inP = nearestEnter(graph, frames, outgoing);
    const { skip } = splitByColumn(outgoing, inP, (edge) =>
      enterPrimary(frames.get(edge.to)!, graph),
    );
    for (const edge of skip) {
      if (assigned.has(edge.index)) continue;
      const target = frames.get(edge.to)!;
      const bypass = skipBypass.get(edge.index) ?? crossOf(source, graph);
      const destP = destTrunks.get(edge.to) ?? enterPrimary(target, graph);
      emitPath(
        paths,
        edge,
        [
          pointAt(fromP, bypass, graph),
          pointAt(destP, bypass, graph),
          pointAt(destP, crossOf(target, graph), graph),
          pointAt(enterPrimary(target, graph), crossOf(target, graph), graph),
        ],
        'stub',
        boundaryArrow(edge, 'end'),
        edge.label ? gapLabel(graph, fromP, enterPrimary(target, graph), bypass) : undefined,
      );
      assigned.add(edge.index);
    }
  }
  return [...paths, ...routeLegacy(graph, frames, assigned)];
}

export function routeEdges(graph: FlowGraph, frames: Map<string, FlowFrame>): FlowEdgePath[] {
  if (graph.edges.some((edge) => usesAuto(edge, graph))) return routeAuto(graph, frames);
  return routeLegacy(graph, frames);
}
