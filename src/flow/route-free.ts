import type { FlowGraph, FlowFrame, FlowEdgePath } from './types.ts';
import {
  portPoint,
  inflate,
  polylineHits,
  sampleCubic,
  graphBounds,
  type Side,
  type Point,
} from './geometry.ts';
import { pathOf, curveLabel, roundedElbow, elbow, pickRoute } from './path.ts';

function freeCurve(
  start: Point,
  end: Point,
  horizontal: boolean,
  out: Side,
  obstacles: FlowFrame[],
) {
  let geometry: ReturnType<typeof pathOf> | undefined;
  // A finite straight approach keeps the whole arrowhead aligned with a
  // visible shaft, not just the mathematical tangent at the endpoint.
  const span = Math.abs(horizontal ? end.x - start.x : end.y - start.y);
  const crossSpan = Math.abs(horizontal ? end.y - start.y : end.x - start.x);
  const lead = Math.min(18, span * 0.22);
  const bend = Math.max(1, (span - lead * 2) * 0.5);
  const sign = out === 'right' || out === 'bottom' ? 1 : -1;
  const leadStart = horizontal
    ? { x: start.x + sign * lead, y: start.y }
    : { x: start.x, y: start.y + sign * lead };
  const leadEnd = horizontal
    ? { x: end.x - sign * lead, y: end.y }
    : { x: end.x, y: end.y - sign * lead };
  const c1 = horizontal
    ? { x: leadStart.x + sign * bend, y: start.y }
    : { x: start.x, y: leadStart.y + sign * bend };
  const c2 = horizontal
    ? { x: leadEnd.x - sign * bend, y: end.y }
    : { x: end.x, y: leadEnd.y - sign * bend };
  const samples = [start, ...sampleCubic(leadStart, c1, c2, leadEnd), end];
  if (!polylineHits(samples, obstacles))
    geometry = {
      path:
        Math.abs(horizontal ? start.y - end.y : start.x - end.x) < 0.01
          ? `M ${start.x} ${start.y} L ${end.x} ${end.y}`
          : `M ${start.x} ${start.y} L ${leadStart.x} ${leadStart.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${leadEnd.x} ${leadEnd.y} L ${end.x} ${end.y}`,
      label: curveLabel(samples),
    };
  if (crossSpan > span * 1.5) {
    // In a narrow corridor, two rounded turns and a straight middle leg
    // avoid a cubic that bends sharply immediately behind the arrowhead.
    const rounded = roundedElbow(elbow(start, end, horizontal));
    if (!polylineHits(rounded.samples, obstacles)) geometry = rounded;
  }
  return geometry;
}

function alignPorts(from: FlowFrame, to: FlowFrame, start: Point, end: Point, horizontal: boolean) {
  // Overlapping central side intervals describe a shared row/column even
  // when differently sized cards have slightly different centers.
  const low = Math.max(
    horizontal ? from.y + from.height * 0.25 : from.x + from.width * 0.25,
    horizontal ? to.y + to.height * 0.25 : to.x + to.width * 0.25,
  );
  const high = Math.min(
    horizontal ? from.y + from.height * 0.75 : from.x + from.width * 0.75,
    horizontal ? to.y + to.height * 0.75 : to.x + to.width * 0.75,
  );
  if (low <= high) {
    const cross = Math.min(high, Math.max(low, horizontal ? end.y : end.x));
    if (horizontal) start.y = end.y = cross;
    else start.x = end.x = cross;
  }
}

/** Route authored free-layout frames, sharing each side between its incident edges. */
export function routeFreeEdges(graph: FlowGraph, frames: Map<string, FlowFrame>): FlowEdgePath[] {
  const groups = new Map<string, { index: number; end: 'from' | 'to'; cross: number }[]>();
  const sides = graph.edges.map((edge) => {
    const from = frames.get(edge.from)!;
    const to = frames.get(edge.to)!;
    const dx = to.x + to.width / 2 - from.x - from.width / 2;
    const dy = to.y + to.height / 2 - from.y - from.height / 2;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const out: Side = horizontal ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'bottom' : 'top';
    const inn: Side = horizontal ? (dx >= 0 ? 'left' : 'right') : dy >= 0 ? 'top' : 'bottom';
    for (const [id, side, end, other] of [
      [edge.from, out, 'from', to],
      [edge.to, inn, 'to', from],
    ] as const) {
      const key = `${id}:${side}`;
      const list = groups.get(key) || [];
      list.push({
        index: edge.index,
        end,
        cross: horizontal ? other.y + other.height / 2 : other.x + other.width / 2,
      });
      groups.set(key, list);
    }
    return { out, inn, horizontal };
  });
  const ports = new Map<string, number>();
  for (const list of groups.values()) {
    list.sort((a, b) => a.cross - b.cross || a.index - b.index);
    list.forEach((entry, i) =>
      ports.set(`${entry.index}:${entry.end}`, (i + 1) / (list.length + 1)),
    );
  }
  return graph.edges.map((edge, i) => {
    const from = frames.get(edge.from)!;
    const to = frames.get(edge.to)!;
    const { out, inn, horizontal } = sides[i];
    const start = portPoint(from, out, ports.get(`${edge.index}:from`)!);
    const end = portPoint(to, inn, ports.get(`${edge.index}:to`)!);
    if (
      groups.get(`${edge.from}:${out}`)!.length === 1 &&
      groups.get(`${edge.to}:${inn}`)!.length === 1
    ) {
      alignPorts(from, to, start, end, horizontal);
    }
    const obstacles = [...frames.values()]
      .filter((box) => box !== from && box !== to)
      .map((box) => inflate(box, 8));
    const route = edge.route || graph.route;
    let geometry;
    if (route === 'curve') geometry = freeCurve(start, end, horizontal, out, obstacles);
    geometry ??=
      route === 'elbow'
        ? pathOf(elbow(start, end, horizontal), 'elbow')
        : pickRoute(start, end, obstacles, route, false, graphBounds([...frames.values()]), out);
    return { index: edge.index, from: edge.from, to: edge.to, ...geometry, role: 'edge' };
  });
}
