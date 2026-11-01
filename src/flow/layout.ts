import { resolveNodeSizes, type FlowMeasureHints } from './measure.ts';
import { fromCanvasScene } from './normalize.ts';
import { orderRanks } from './order.ts';
import { placeNodes } from './place.ts';
import { rankNodes } from './rank.ts';
import { routeEdges } from './route.ts';
import type { FlowGraph, FlowLayoutResult, FlowSceneInput } from './types.ts';
import { validateFlow } from './validate.ts';

export function layoutFlow(graph: FlowGraph, measured: FlowMeasureHints = []): FlowLayoutResult {
  const ranked = orderRanks(graph, rankNodes(graph));
  const sized = resolveNodeSizes(graph, ranked, measured);
  const placed = placeNodes(graph, sized.measures, ranked, sized.gap);
  const bounded = { ...graph, height: placed.height };
  const edgePaths = routeEdges(bounded, placed.frames);
  return {
    width: graph.width,
    height: placed.height,
    nodeFrames: placed.frames,
    edgePaths,
    diagnostics: [
      ...sized.diagnostics,
      ...validateFlow(bounded, placed.frames, edgePaths, sized.measures),
    ],
  };
}

export function layoutFlowFromCanvas(scene: FlowSceneInput, measured: FlowMeasureHints = []) {
  return layoutFlow(fromCanvasScene(scene), measured);
}
