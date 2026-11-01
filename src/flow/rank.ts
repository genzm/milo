import type { FlowGraph, FlowRanked } from './types.ts';

/** Layer nodes so each edge goes forward. Cycles stay in authored order for now. */
export function rankNodes(graph: FlowGraph): FlowRanked {
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]));
  const incoming = graph.nodes.map(() => 0);
  const outgoing = graph.nodes.map(() => [] as number[]);
  for (const edge of graph.edges) {
    const from = index.get(edge.from)!;
    const to = index.get(edge.to)!;
    incoming[to] += 1;
    outgoing[from].push(to);
  }
  const queue = incoming.map((count, i) => (count ? -1 : i)).filter((i) => i >= 0);
  const rank = graph.nodes.map(() => 0);
  const seen = new Set<number>();
  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of outgoing[current]) {
      rank[next] = Math.max(rank[next], rank[current] + 1);
      incoming[next] -= 1;
      if (!incoming[next]) queue.push(next);
    }
  }
  let last = Math.max(0, ...rank);
  graph.nodes.forEach((_, i) => {
    if (!seen.has(i)) rank[i] = ++last;
  });
  if (!graph.edges.length) rank.forEach((_, i) => (rank[i] = i));
  const groups = Array.from({ length: Math.max(...rank) + 1 }, () => [] as number[]);
  rank.forEach((value, i) => groups[value].push(i));
  return { rank, groups, feedback: new Set() };
}
