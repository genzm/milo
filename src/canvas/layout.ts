import { layoutFlowFromCanvas } from '../flow/layout.ts';
import { estimateNodeHeight } from '../flow/measure.ts';
import type { FlowDiagnostic } from '../flow/types.ts';
import type { CanvasFrame, CanvasNode, CanvasScene } from './types.ts';

function estimatedHeight(node: CanvasNode) {
  return estimateNodeHeight(node.markdown);
}

/** Resolve flow height from its measured node contents; free and explicit heights stay fixed. */
export function canvasHeight(scene: CanvasScene, measured: number[] = []): number {
  if (scene.options.layout === 'free' || !scene.options.autoHeight) return scene.options.height;
  return layoutFlowFromCanvas(scene, measured).height;
}

/** Deterministic scene layout; measured heights can be supplied by the DOM renderer. */
export function layoutCanvas(scene: CanvasScene, measured: number[] = []): CanvasFrame[] {
  const { options, nodes } = scene;
  if (options.layout === 'free') {
    return nodes.map((node, i) => ({
      x: (node.x ?? 36 + (i % 3) * 300) + node.dx,
      y: (node.y ?? 32 + Math.floor(i / 3) * 150) + node.dy,
      width: node.width ?? 230,
      height: node.height ?? measured[i] ?? estimatedHeight(node),
    }));
  }
  const layout = layoutFlowFromCanvas(scene, measured);
  return nodes.map((node) => layout.nodeFrames.get(node.id)!);
}

export function canvasDiagnostics(scene: CanvasScene, measured: number[] = []): FlowDiagnostic[] {
  if (scene.options.layout === 'free') return [];
  return layoutFlowFromCanvas(scene, measured).diagnostics;
}
