import { measureNodes } from './measure.ts';
import { fromCanvasScene } from './normalize.ts';
import { orderRanks } from './order.ts';
import { placeNodes } from './place.ts';
import { rankNodes } from './rank.ts';
import { routeEdges } from './route.ts';
import type { FlowGraph, FlowLayoutResult, FlowSceneInput } from './types.ts';
import { validateFlow } from './validate.ts';

export function layoutFlow(graph: FlowGraph, measuredHeights: number[] = []): FlowLayoutResult {
  const measures = measureNodes(graph, measuredHeights);
  const ranked = orderRanks(graph, rankNodes(graph));
  const placed = placeNodes(graph, measures, ranked);
  const bounded = { ...graph, height: placed.height };
  const edgePaths = routeEdges(bounded, placed.frames);
  return {
    width: graph.width,
    height: placed.height,
    nodeFrames: placed.frames,
    edgePaths,
    diagnostics: validateFlow(bounded, placed.frames, edgePaths, measures),
  };
}

export function layoutFlowFromCanvas(scene: FlowSceneInput, measuredHeights: number[] = []) {
  return layoutFlow(fromCanvasScene(scene), measuredHeights);
}
