import { FLOW, type FlowFrame, type FlowGraph, type FlowRanked } from './types.ts';

/** Ordering constraints between aligned blocks; null means a cyclic or overlapping alignment. */
function separationConstraints(
  candidate: number[],
  ranks: number[][],
  crossSizes: number[],
  gap: number,
) {
  const edges = new Map<number, Map<number, number>>();
  for (const id of candidate) edges.set(id, new Map());
  for (const members of ranks) {
    // An alignment block may contain only one node per rank.
    if (new Set(members.map((i) => candidate[i])).size !== members.length) return null;
    for (let j = 1; j < members.length; j++) {
      const a = members[j - 1],
        b = members[j];
      const distance = (crossSizes[a] + crossSizes[b]) / 2 + gap;
      const next = edges.get(candidate[a])!;
      next.set(candidate[b], Math.max(next.get(candidate[b]) || 0, distance));
    }
  }
  const degree = new Map([...edges.keys()].map((id) => [id, 0]));
  for (const next of edges.values())
    for (const id of next.keys()) degree.set(id, degree.get(id)! + 1);
  const order = [...degree.keys()].filter((id) => degree.get(id) === 0);
  for (let i = 0; i < order.length; i++)
    for (const id of edges.get(order[i])!.keys()) {
      degree.set(id, degree.get(id)! - 1);
      if (degree.get(id) === 0) order.push(id);
    }
  return order.length === edges.size ? { edges, order } : null;
}

/** Align central branches across ranks, then compact without changing rank order. */
export function alignBranches(
  graph: FlowGraph,
  ranked: FlowRanked,
  frames: Map<string, FlowFrame>,
  height: number,
  gap: number,
) {
  if (graph.route !== 'auto' || graph.nodes.some((node) => node.pinned || node.dx || node.dy))
    return { frames, height };
  const horizontal = graph.direction === 'right' || graph.direction === 'left';
  const crossSize = (box: FlowFrame) => (horizontal ? box.height : box.width);
  const crossCenter = (box: FlowFrame) => (horizontal ? box.y : box.x) + crossSize(box) / 2;
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]));
  let blocks = graph.nodes.map((_, i) => i);
  const crossSizes = graph.nodes.map((node) => crossSize(frames.get(node.id)!));
  const constraints = (candidate: number[]) =>
    separationConstraints(candidate, ranked.groups, crossSizes, gap);
  const join = (a: number, b: number) => {
    if (blocks[a] === blocks[b]) return;
    const candidate = blocks.map((id) => (id === blocks[b] ? blocks[a] : id));
    // Crossing median constraints must never invert or overlap a rank.
    if (constraints(candidate)) blocks = candidate;
  };
  const outgoing = new Map<number, number[]>(),
    incoming = new Map<number, number[]>();
  for (const edge of graph.edges) {
    const a = index.get(edge.from)!,
      b = index.get(edge.to)!;
    if (edge.feedback || (edge.route && edge.route !== 'auto')) continue;
    outgoing.set(a, [...new Set([...(outgoing.get(a) || []), b])]);
    incoming.set(b, [...new Set([...(incoming.get(b) || []), a])]);
  }
  for (const groups of [outgoing, incoming])
    for (const neighbors of groups.values()) {
      neighbors.sort(
        (a, b) =>
          crossCenter(frames.get(graph.nodes[a].id)!) - crossCenter(frames.get(graph.nodes[b].id)!),
      );
    }
  const median = (neighbors: number[]) =>
    neighbors.length % 2 ? neighbors[Math.floor(neighbors.length / 2)] : undefined;
  for (const [node, neighbors] of outgoing) {
    const next = median(neighbors);
    if (next !== undefined && median(incoming.get(next)!) === node) join(node, next);
  }
  const { edges, order } = constraints(blocks)!;
  const positions = new Map(order.map((id) => [id, 0]));
  for (const id of order)
    for (const [next, distance] of edges.get(id)!)
      positions.set(next, Math.max(positions.get(next)!, positions.get(id)! + distance));

  const blockCounts = new Map<number, number>();
  for (const id of blocks) blockCounts.set(id, (blockCounts.get(id) || 0) + 1);

  // For even fan-outs / fan-ins, center an unconstrained node between the two
  // middle neighbors. Bound it by the same rank-separation constraints.
  for (const groups of [incoming, outgoing])
    for (const [node, neighbors] of groups) {
      if (neighbors.length % 2 || blockCounts.get(blocks[node]) !== 1) continue;
      const middle = neighbors.length / 2;
      const wanted =
        (positions.get(blocks[neighbors[middle - 1]])! +
          positions.get(blocks[neighbors[middle]])!) /
        2;
      let low = -Infinity,
        high = Infinity;
      for (const [before, next] of edges)
        if (next.has(blocks[node]))
          low = Math.max(low, positions.get(before)! + next.get(blocks[node])!);
      for (const [after, distance] of edges.get(blocks[node])!)
        high = Math.min(high, positions.get(after)! - distance);
      positions.set(blocks[node], Math.min(high, Math.max(low, wanted)));
    }
  const centers = graph.nodes.map((_, i) => positions.get(blocks[i])!);
  const lo = Math.min(
    ...graph.nodes.map((node, i) => centers[i] - crossSize(frames.get(node.id)!) / 2),
  );
  const hi = Math.max(
    ...graph.nodes.map((node, i) => centers[i] + crossSize(frames.get(node.id)!) / 2),
  );
  const required = hi - lo + FLOW.PADDING * 2;
  const crossLimit = horizontal ? height : graph.width;
  // Fixed frames retain their existing placement when alignment would require
  // additional space. Auto-height diagrams can grow to preserve separation.
  if (required > crossLimit && !(horizontal && graph.autoHeight)) return { frames, height };
  const nextHeight =
    horizontal && graph.autoHeight ? Math.max(height, Math.ceil(required)) : height;
  const offset = ((horizontal ? nextHeight : graph.width) - (hi - lo)) / 2 - lo;
  const aligned = new Map<string, FlowFrame>();
  graph.nodes.forEach((node, i) => {
    const box = frames.get(node.id)!;
    const cross = centers[i] + offset - crossSize(box) / 2;
    aligned.set(node.id, { ...box, ...(horizontal ? { y: cross } : { x: cross }) });
  });
  return { frames: aligned, height: nextHeight };
}
