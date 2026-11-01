import type { FlowEdgePath, FlowFrame, FlowGraph, FlowRoute } from './types.ts';

export function routeConnection(from: FlowFrame, to: FlowFrame, route: FlowRoute) {
  const a = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const b = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  let start, end;
  if (horizontal) {
    start = { x: a.x + (Math.sign(dx || 1) * from.width) / 2, y: a.y };
    end = { x: b.x - (Math.sign(dx || 1) * to.width) / 2, y: b.y };
  } else {
    start = { x: a.x, y: a.y + (Math.sign(dy || 1) * from.height) / 2 };
    end = { x: b.x, y: b.y - (Math.sign(dy || 1) * to.height) / 2 };
  }
  let path: string;
  if (route === 'straight') path = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  else if (route === 'elbow') {
    path = horizontal
      ? `M ${start.x} ${start.y} H ${(start.x + end.x) / 2} V ${end.y} H ${end.x}`
      : `M ${start.x} ${start.y} V ${(start.y + end.y) / 2} H ${end.x} V ${end.y}`;
  } else {
    const bend = horizontal ? Math.max(35, Math.abs(dx) * 0.42) : Math.max(35, Math.abs(dy) * 0.42);
    path = horizontal
      ? `M ${start.x} ${start.y} C ${start.x + Math.sign(dx || 1) * bend} ${start.y}, ${end.x - Math.sign(dx || 1) * bend} ${end.y}, ${end.x} ${end.y}`
      : `M ${start.x} ${start.y} C ${start.x} ${start.y + Math.sign(dy || 1) * bend}, ${end.x} ${end.y - Math.sign(dy || 1) * bend}, ${end.x} ${end.y}`;
  }
  return { path, label: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 8 } };
}

export function routeEdges(graph: FlowGraph, frames: Map<string, FlowFrame>): FlowEdgePath[] {
  return graph.edges.flatMap((edge) => {
    const from = frames.get(edge.from);
    const to = frames.get(edge.to);
    if (!from || !to) return [];
    const geometry = routeConnection(from, to, edge.route || graph.route);
    return [{ from: edge.from, to: edge.to, ...geometry }];
  });
}
