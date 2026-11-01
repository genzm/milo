import {
  FLOW,
  diagnostic,
  type FlowDiagnostic,
  type FlowGraph,
  type FlowNodeMeasure,
  type FlowRanked,
} from './types.ts';

export type FlowMeasureHints = number[] | { heights?: number[]; atWidth?: Map<number, number[]> };

export function estimateNodeHeight(markdown: string) {
  return estimateHeightAtWidth(markdown, FLOW.PREFERRED_WIDTH);
}

export function estimateHeightAtWidth(markdown: string, width: number) {
  const inner = Math.max(48, width - 48);
  const lines = markdown
    .replace(/```[\s\S]*?```/g, 'コード')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return 76;
  let height = 28;
  for (const line of lines) {
    const heading = /^#{1,6}\s+/.test(line);
    const text = line.replace(/^#{1,6}\s+/, '').replace(/[#>*_`+\-]/g, '');
    const font = heading ? FLOW.TITLE_PX : FLOW.BODY_PX;
    const units = [...text].reduce((sum, ch) => sum + (/[\u3000-\u9fff]/.test(ch) ? 1 : 0.55), 0);
    const wrapped = Math.max(1, Math.ceil(units / Math.max(4, inner / font)));
    height += wrapped * font * (heading ? 1.3 : 1.5) + (heading ? 8 : 6);
  }
  return Math.max(76, Math.min(420, Math.round(height)));
}

function hintsOf(input: FlowMeasureHints | undefined) {
  if (!input)
    return { heights: [] as number[], atWidth: undefined as Map<number, number[]> | undefined };
  if (Array.isArray(input)) return { heights: input, atWidth: undefined };
  return { heights: input.heights || [], atWidth: input.atWidth };
}

function heightFor(
  graph: FlowGraph,
  index: number,
  width: number,
  hints: ReturnType<typeof hintsOf>,
) {
  const node = graph.nodes[index];
  if (node.height !== undefined) return node.height;
  const exact = hints.atWidth?.get(width)?.[index];
  if (exact && exact > 1) return exact;
  if (hints.heights[index] > 1 && !hints.atWidth) return hints.heights[index];
  return estimateHeightAtWidth(node.markdown, width);
}

function packFits(
  graph: FlowGraph,
  groups: number[][],
  sizes: { width: number; height: number }[],
  gap: number,
) {
  const horizontal = graph.direction === 'right' || graph.direction === 'left';
  const primaryLimit =
    (horizontal ? graph.width : graph.autoHeight ? Number.POSITIVE_INFINITY : graph.height) -
    FLOW.PADDING * 2;
  const crossLimit =
    (horizontal ? (graph.autoHeight ? Number.POSITIVE_INFINITY : graph.height) : graph.width) -
    FLOW.PADDING * 2;
  const groupPrimary = groups.map((members) =>
    Math.max(...members.map((i) => (horizontal ? sizes[i].width : sizes[i].height))),
  );
  const occupied = groupPrimary.reduce((sum, value) => sum + value, 0);
  if (occupied + gap * Math.max(0, groups.length - 1) > primaryLimit + 0.5) return false;
  return groups.every((members) => {
    const cross =
      members.reduce((sum, i) => sum + (horizontal ? sizes[i].height : sizes[i].width), 0) +
      gap * Math.max(0, members.length - 1);
    return cross <= crossLimit + 0.5;
  });
}

function scoreSizes(sizes: { width: number; height: number }[], gap: number, graph: FlowGraph) {
  const widths = sizes.map((size) => size.width);
  const heights = sizes.map((size) => size.height);
  const meanH = heights.reduce((sum, value) => sum + value, 0) / heights.length;
  const variance = heights.reduce((sum, value) => sum + (value - meanH) ** 2, 0) / heights.length;
  const used = widths.reduce((sum, value) => sum + value, 0) + gap * Math.max(0, sizes.length - 1);
  return (
    widths.reduce((sum, value) => sum + value, 0) * 2 +
    gap -
    variance * 0.15 -
    Math.max(...heights) * 0.05 +
    Math.min(used, graph.width)
  );
}

export function resolveNodeSizes(
  graph: FlowGraph,
  ranked: FlowRanked,
  measured: FlowMeasureHints = [],
) {
  const hints = hintsOf(measured);
  const horizontal = graph.direction === 'right' || graph.direction === 'left';
  const preferredGap = graph.gap;
  const minGap = Math.min(graph.gap, FLOW.MIN_GAP);
  const gaps = preferredGap > minGap ? [preferredGap, minGap] : [minGap];
  const candidates = horizontal ? [...FLOW.WIDTH_CANDIDATES].reverse() : [FLOW.VERTICAL_WIDTH];
  let best:
    { measures: FlowNodeMeasure[]; gap: number; score: number; overflow: boolean } | undefined;

  for (const gap of gaps) {
    for (const candidate of candidates) {
      const sizes = graph.nodes.map((node, i) => {
        const width = node.width ?? (horizontal ? candidate : FLOW.VERTICAL_WIDTH);
        return { width, height: heightFor(graph, i, width, hints) };
      });
      if (!packFits(graph, ranked.groups, sizes, gap)) continue;
      const score = scoreSizes(sizes, gap, graph);
      if (!best || score > best.score) {
        best = {
          gap,
          score,
          overflow: false,
          measures: sizes.map((size, i) => ({
            id: graph.nodes[i].id,
            minWidth: graph.nodes[i].width ?? FLOW.MIN_WIDTH,
            preferredWidth: size.width,
            maxWidth: graph.nodes[i].width ?? FLOW.MAX_WIDTH,
            measuredHeight: size.height,
            width: size.width,
            height: size.height,
          })),
        };
      }
    }
  }

  const diagnostics: FlowDiagnostic[] = [];
  if (best) return { ...best, diagnostics };

  const fallbackWidth = horizontal ? FLOW.MIN_WIDTH : FLOW.VERTICAL_WIDTH;
  const sizes = graph.nodes.map((node, i) => {
    const width = node.width ?? fallbackWidth;
    return { width, height: heightFor(graph, i, width, hints) };
  });
  diagnostics.push(
    diagnostic(
      'INSUFFICIENT_SPACE',
      graph.nodes.map((node) => node.id),
    ),
  );
  return {
    gap: minGap,
    score: 0,
    overflow: true,
    diagnostics,
    measures: sizes.map((size, i) => ({
      id: graph.nodes[i].id,
      minWidth: graph.nodes[i].width ?? FLOW.MIN_WIDTH,
      preferredWidth: size.width,
      maxWidth: graph.nodes[i].width ?? FLOW.MAX_WIDTH,
      measuredHeight: size.height,
      width: size.width,
      height: size.height,
    })),
  };
}

export function measureNodes(graph: FlowGraph, measured: FlowMeasureHints = []): FlowNodeMeasure[] {
  return resolveNodeSizes(
    graph,
    {
      rank: graph.nodes.map((_, i) => i),
      groups: [graph.nodes.map((_, i) => i)],
      feedback: new Set(),
    },
    measured,
  ).measures;
}
