import type { FlowGraph, FlowRanked } from './types.ts';

/** Keep authored order inside each rank. Later PRs replace this with a barycenter pass. */
export function orderRanks(graph: FlowGraph, ranked: FlowRanked): FlowRanked {
  const groups = ranked.groups.map((members) =>
    [...members].sort((a, b) => graph.nodes[a].index - graph.nodes[b].index),
  );
  return { ...ranked, groups };
}
