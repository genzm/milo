import {
  FLOW,
  type FlowFrame,
  type FlowGraph,
  type FlowNodeMeasure,
  type FlowRanked,
} from './types.ts';
import { alignBranches } from './align.ts';

function axisGaps(graph: FlowGraph, gap = graph.gap) {
  const rankGap = graph.route === 'auto' ? Math.max(gap, FLOW.RANK_GAP) : gap;
  return { rankGap, crossGap: gap };
}

export function contentHeight(
  graph: FlowGraph,
  groups: number[][],
  sizes: { width: number; height: number }[],
  gap = graph.gap,
) {
  const horizontal = graph.direction === 'right' || graph.direction === 'left';
  const { rankGap, crossGap } = axisGaps(graph, gap);
  const packed = horizontal
    ? Math.max(
        ...groups.map(
          (members) =>
            members.reduce((sum, i) => sum + sizes[i].height, 0) +
            crossGap * Math.max(0, members.length - 1),
        ),
      )
    : groups.reduce((sum, members) => sum + Math.max(...members.map((i) => sizes[i].height)), 0) +
      rankGap * Math.max(0, groups.length - 1);
  const feedbackPad = graph.edges.some((edge) => edge.feedback) ? FLOW.FEEDBACK_PAD * 2 : 0;
  return Math.max(FLOW.MIN_HEIGHT, Math.ceil(packed + FLOW.HEIGHT_PAD + feedbackPad));
}

export function placeNodes(
  graph: FlowGraph,
  measures: FlowNodeMeasure[],
  ranked: FlowRanked,
  gap = graph.gap,
) {
  const horizontal = graph.direction === 'right' || graph.direction === 'left';
  const sizes = measures.map((measure) => ({ width: measure.width, height: measure.height }));
  const height = graph.autoHeight ? contentHeight(graph, ranked.groups, sizes, gap) : graph.height;
  const primarySize = horizontal ? graph.width : height;
  const crossSize = horizontal ? height : graph.width;
  const padding = FLOW.PADDING;
  const groupPrimary = ranked.groups.map((members) =>
    Math.max(...members.map((i) => (horizontal ? sizes[i].width : sizes[i].height))),
  );
  const occupied = groupPrimary.reduce((sum, value) => sum + value, 0);
  const rankCount = ranked.groups.length;
  const inner = Math.max(0, primarySize - padding * 2);
  const { rankGap, crossGap } = axisGaps(graph, gap);
  const packed = occupied + rankGap * Math.max(0, rankCount - 1);
  const usedGap =
    rankCount > 1 && packed > inner + 0.5
      ? Math.max(FLOW.MIN_GAP, (inner - occupied) / (rankCount - 1))
      : rankGap;
  const usedPacked = occupied + usedGap * Math.max(0, rankCount - 1);
  const origin = padding + Math.max(0, (inner - usedPacked) / 2);
  const primaryPositions: number[] = [];
  let primaryCursor = origin;
  groupPrimary.forEach((length, i) => {
    primaryPositions.push(primaryCursor);
    primaryCursor += length + (i < rankCount - 1 ? usedGap : 0);
  });
  const frames = new Map<string, FlowFrame>();
  ranked.groups.forEach((members, groupIndex) => {
    const crossLengths = members.map((i) => (horizontal ? sizes[i].height : sizes[i].width));
    const total =
      crossLengths.reduce((sum, value) => sum + value, 0) + crossGap * (members.length - 1);
    let cross = Math.max(padding, (crossSize - total) / 2);
    members.forEach((nodeIndex, memberIndex) => {
      const node = graph.nodes[nodeIndex];
      const size = sizes[nodeIndex];
      const rawPrimary = primaryPositions[groupIndex];
      const primary =
        graph.direction === 'left' || graph.direction === 'up'
          ? primarySize - rawPrimary - (horizontal ? size.width : size.height)
          : rawPrimary;
      let x = horizontal ? primary : cross;
      let y = horizontal ? cross : primary;
      if (node.pinned && node.x !== undefined) x = node.x;
      if (node.pinned && node.y !== undefined) y = node.y;
      frames.set(node.id, {
        x: x + node.dx,
        y: y + node.dy,
        width: size.width,
        height: size.height,
      });
      cross += crossLengths[memberIndex] + crossGap;
    });
  });
  return alignBranches(graph, ranked, frames, height, crossGap);
}
