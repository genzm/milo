import { edgeKey, type FlowGraph, type FlowRanked } from './types.ts';

function sortByBarycenter(
  members: number[],
  neighborOrder: number[],
  neighbors: number[][],
  authored: number[],
) {
  const position = new Map(neighborOrder.map((node, i) => [node, i]));
  const bary = (node: number) => {
    const connected = neighbors[node].filter((item) => position.has(item));
    if (!connected.length) return (neighborOrder.length - 1) / 2;
    return connected.reduce((sum, item) => sum + (position.get(item) || 0), 0) / connected.length;
  };
  return [...members].sort((a, b) => {
    const delta = bary(a) - bary(b);
    if (Math.abs(delta) > 1e-9) return delta;
    return authored[a] - authored[b];
  });
}

/** Reduce crossings with a stable barycenter sweep. Ties keep the manuscript order. */
export function orderRanks(graph: FlowGraph, ranked: FlowRanked): FlowRanked {
  const authored = graph.nodes.map((node) => node.index);
  const groups = ranked.groups.map((members) => [...members]);
  const forward = graph.nodes.map(() => [] as number[]);
  const backward = graph.nodes.map(() => [] as number[]);
  for (const edge of graph.edges) {
    if (ranked.feedback.has(edgeKey(edge.from, edge.to))) continue;
    const from = graph.nodes.findIndex((node) => node.id === edge.from);
    const to = graph.nodes.findIndex((node) => node.id === edge.to);
    if (from < 0 || to < 0) continue;
    forward[from].push(to);
    backward[to].push(from);
  }
  for (let pass = 0; pass < 6; pass += 1) {
    for (let rank = 1; rank < groups.length; rank += 1) {
      groups[rank] = sortByBarycenter(groups[rank], groups[rank - 1], backward, authored);
    }
    for (let rank = groups.length - 2; rank >= 0; rank -= 1) {
      groups[rank] = sortByBarycenter(groups[rank], groups[rank + 1], forward, authored);
    }
  }
  return { ...ranked, groups };
}
