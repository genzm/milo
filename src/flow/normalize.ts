import type { FlowGraph, FlowSceneInput } from './types.ts';

export function fromCanvasScene(scene: FlowSceneInput): FlowGraph {
  return {
    direction: scene.options.direction,
    width: scene.options.width,
    height: scene.options.height,
    autoHeight: scene.options.autoHeight,
    gap: scene.options.gap,
    route: scene.options.route,
    nodes: scene.nodes.map((node, index) => ({
      id: node.id,
      markdown: node.markdown,
      shape: node.shape,
      index,
      width: node.width,
      height: node.height,
      x: node.x,
      y: node.y,
      dx: node.dx,
      dy: node.dy,
      pinned: node.pinned,
    })),
    edges: scene.edges.map((edge, index) => ({
      index,
      from: edge.from,
      to: edge.to,
      label: edge.label,
      route: edge.route,
      arrows: edge.arrows,
    })),
  };
}
