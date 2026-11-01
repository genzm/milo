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

function scoreSizes(graph: FlowGraph, sizes: { width: number; height: number }[], gap: number) {
  const widths = sizes.map((size) => size.width);
  const heights = sizes.map((size) => size.height);
  const meanH = heights.reduce((sum, value) => sum + value, 0) / heights.length;
  const meanW = widths.reduce((sum, value) => sum + value, 0) / widths.length;
  const heightVar = heights.reduce((sum, value) => sum + (value - meanH) ** 2, 0) / heights.length;
  const widthVar = widths.reduce((sum, value) => sum + (value - meanW) ** 2, 0) / widths.length;
  const misfit = sizes.reduce((sum, size, i) => {
    const preferred =
      graph.nodes[i].width ?? snapWidth(estimatePreferredWidth(graph.nodes[i].markdown));
    return sum + Math.abs(size.width - preferred);
  }, 0);
  return -Math.max(...heights) * 3 - misfit * 0.4 - heightVar * 0.15 - widthVar * 0.04 + gap * 0.01;
}

function textUnits(text: string) {
  return [...text].reduce((sum, ch) => sum + (/[\u3000-\u9fff]/.test(ch) ? 1 : 0.55), 0);
}

export function estimateEdgeLabel(text: string) {
  const value = text.trim();
  if (!value) return { width: 0, height: 0 };
  const width = Math.max(20, Math.round(textUnits(value) * FLOW.LABEL_PX + 8));
  return { width, height: Math.round(FLOW.LABEL_PX * 1.3) };
}

export function estimatePreferredWidth(markdown: string) {
  const lines = markdown
    .replace(/```[\s\S]*?```/g, 'コード')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return FLOW.PREFERRED_WIDTH;
  let needed = FLOW.MIN_WIDTH;
  for (const line of lines) {
    const heading = /^#{1,6}\s+/.test(line);
    const text = line.replace(/^#{1,6}\s+/, '').replace(/[#>*_`+\-]/g, '');
    const font = heading ? FLOW.TITLE_PX : FLOW.BODY_PX;
    const maxLines = heading ? 2 : 3;
    needed = Math.max(needed, (textUnits(text) / maxLines) * font + 48);
  }
  return Math.min(FLOW.MAX_WIDTH, Math.max(FLOW.MIN_WIDTH, Math.round(needed)));
}

function snapWidth(width: number, min = FLOW.MIN_WIDTH, max = FLOW.MAX_WIDTH) {
  const lo = Math.max(min, FLOW.MIN_WIDTH);
  const hi = Math.min(max, FLOW.MAX_WIDTH);
  const pool = FLOW.WIDTH_CANDIDATES.filter(
    (candidate) => candidate >= lo - 0.5 && candidate <= hi + 0.5,
  );
  const choices = pool.length ? pool : FLOW.WIDTH_CANDIDATES;
  return choices.reduce((best, candidate) =>
    Math.abs(candidate - width) < Math.abs(best - width) ? candidate : best,
  );
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? FLOW.PREFERRED_WIDTH;
}

function capWidths(graph: FlowGraph, widths: number[]) {
  const flexible = widths.filter((_, i) => graph.nodes[i].width === undefined);
  const band = median(flexible.length ? flexible : widths);
  return widths.map((width, i) => {
    if (graph.nodes[i].width !== undefined) return graph.nodes[i].width!;
    return snapWidth(width, band - FLOW.WIDTH_VARIANCE, band + FLOW.WIDTH_VARIANCE);
  });
}

function unifyRankWidths(groups: number[][], widths: number[]) {
  const next = [...widths];
  for (const members of groups) {
    const widest = Math.max(...members.map((i) => next[i]));
    for (const i of members) next[i] = widest;
  }
  return next;
}

function shrinkWidest(graph: FlowGraph, widths: number[]) {
  const flexible = widths
    .map((width, i) => (graph.nodes[i].width === undefined ? width : -1))
    .filter((width) => width > 0);
  if (!flexible.length) return undefined;
  const maxWidth = Math.max(...flexible);
  const smaller = [...FLOW.WIDTH_CANDIDATES].filter((candidate) => candidate < maxWidth).pop();
  if (smaller === undefined) return undefined;
  return widths.map((width, i) =>
    graph.nodes[i].width === undefined && width === maxWidth ? smaller : width,
  );
}

function consider(
  graph: FlowGraph,
  ranked: FlowRanked,
  hints: ReturnType<typeof hintsOf>,
  widths: number[],
  gap: number,
  best: { measures: FlowNodeMeasure[]; gap: number; score: number; overflow: boolean } | undefined,
) {
  const sizes = widths.map((width, i) => ({ width, height: heightFor(graph, i, width, hints) }));
  if (!packFits(graph, ranked.groups, sizes, gap)) return best;
  const score = scoreSizes(graph, sizes, gap);
  if (best && score <= best.score) return best;
  return {
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
    let widths = capWidths(
      graph,
      graph.nodes.map((node) => {
        if (node.width !== undefined) return node.width;
        return horizontal ? snapWidth(estimatePreferredWidth(node.markdown)) : FLOW.VERTICAL_WIDTH;
      }),
    );
    widths = capWidths(graph, unifyRankWidths(ranked.groups, widths));
    for (;;) {
      best = consider(graph, ranked, hints, widths, gap, best);
      const next = shrinkWidest(graph, widths);
      if (!next) break;
      widths = capWidths(graph, unifyRankWidths(ranked.groups, next));
    }
    for (const candidate of candidates) {
      const unified = graph.nodes.map(
        (node) => node.width ?? (horizontal ? candidate : FLOW.VERTICAL_WIDTH),
      );
      best = consider(graph, ranked, hints, unified, gap, best);
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
