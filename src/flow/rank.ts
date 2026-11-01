import { edgeKey, type FlowGraph, type FlowRanked } from './types.ts';

function adjacency(graph: FlowGraph) {
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]));
  const outgoing = graph.nodes.map(() => [] as number[]);
  const incoming = graph.nodes.map(() => [] as number[]);
  const pairs = graph.edges.map((edge) => ({
    edge,
    from: index.get(edge.from)!,
    to: index.get(edge.to)!,
    key: edgeKey(edge.from, edge.to),
  }));
  for (const pair of pairs) {
    outgoing[pair.from].push(pair.to);
    incoming[pair.to].push(pair.from);
  }
  return { index, outgoing, incoming, pairs };
}

function feedbackEdges(
  graph: FlowGraph,
  outgoing: number[][],
  pairs: { from: number; to: number; key: string }[],
) {
  const feedback = new Set<string>();
  const visiting = new Set<number>();
  const visited = new Set<number>();
  const walk = (node: number) => {
    visiting.add(node);
    for (const next of outgoing[node]) {
      if (visiting.has(next)) {
        const found = pairs.find((pair) => pair.from === node && pair.to === next);
        if (found) feedback.add(found.key);
        continue;
      }
      if (!visited.has(next)) walk(next);
    }
    visiting.delete(node);
    visited.add(node);
  };
  graph.nodes.forEach((_, i) => {
    if (!visited.has(i)) walk(i);
  });
  for (const pair of pairs) if (pair.from === pair.to) feedback.add(pair.key);
  return feedback;
}

function longestPathRanks(
  count: number,
  pairs: { from: number; to: number; key: string }[],
  feedback: Set<string>,
) {
  const incoming = Array.from({ length: count }, () => 0);
  const outgoing = Array.from({ length: count }, () => [] as number[]);
  for (const pair of pairs) {
    if (feedback.has(pair.key)) continue;
    incoming[pair.to] += 1;
    outgoing[pair.from].push(pair.to);
  }
  const queue = incoming.map((value, i) => (value ? -1 : i)).filter((i) => i >= 0);
  const rank = Array.from({ length: count }, () => 0);
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
  for (let i = 0; i < count; i += 1) {
    if (!seen.has(i)) rank[i] = ++last;
  }
  return rank;
}

export function rankNodes(graph: FlowGraph): FlowRanked {
  const { outgoing, pairs } = adjacency(graph);
  const feedback = graph.edges.length ? feedbackEdges(graph, outgoing, pairs) : new Set<string>();
  const rank = graph.edges.length
    ? longestPathRanks(graph.nodes.length, pairs, feedback)
    : graph.nodes.map((_, i) => i);
  for (const pair of pairs) {
    if (rank[pair.to] <= rank[pair.from]) feedback.add(pair.key);
  }
  const groups = Array.from({ length: Math.max(0, ...rank) + 1 }, () => [] as number[]);
  rank.forEach((value, i) => groups[value].push(i));
  graph.edges.forEach((edge) => {
    edge.feedback = feedback.has(edgeKey(edge.from, edge.to));
  });
  return { rank, groups, feedback };
}
