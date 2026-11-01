import { estimateEdgeLabel } from './measure.ts';
import { edgeHitsNode } from './route.ts';
import {
  diagnostic,
  edgeKey,
  type FlowDiagnostic,
  type FlowEdgePath,
  type FlowFrame,
  type FlowGraph,
  type FlowNodeMeasure,
} from './types.ts';

function overlaps(a: FlowFrame, b: FlowFrame) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function leaves(box: FlowFrame, width: number, height: number, slack = 1) {
  return (
    box.x < -slack ||
    box.y < -slack ||
    box.x + box.width > width + slack ||
    box.y + box.height > height + slack
  );
}

export function validateFlow(
  graph: FlowGraph,
  frames: Map<string, FlowFrame>,
  paths: FlowEdgePath[],
  measures: FlowNodeMeasure[],
): FlowDiagnostic[] {
  const diagnostics: FlowDiagnostic[] = [];
  const boxes = graph.nodes.map((node) => ({ id: node.id, box: frames.get(node.id) }));
  for (const { id, box } of boxes) {
    if (!box) continue;
    if (leaves(box, graph.width, graph.autoHeight ? Number.POSITIVE_INFINITY : graph.height)) {
      diagnostics.push(diagnostic('FRAME_OVERFLOW', [id]));
    }
  }
  for (let i = 0; i < boxes.length; i += 1) {
    const a = boxes[i].box;
    if (!a) continue;
    for (let j = i + 1; j < boxes.length; j += 1) {
      const b = boxes[j].box;
      if (b && overlaps(a, b))
        diagnostics.push(diagnostic('NODE_OVERLAP', [boxes[i].id, boxes[j].id]));
    }
  }
  for (const measure of measures) {
    const box = frames.get(measure.id);
    if (box && measure.measuredHeight > box.height + 1) {
      diagnostics.push(diagnostic('TEXT_OVERFLOW', [measure.id]));
    }
  }
  if (
    !graph.autoHeight &&
    [...frames.values()].some(
      (box) => box.y + box.height > graph.height + 1 || box.x + box.width > graph.width + 1,
    )
  ) {
    if (!diagnostics.some((item) => item.code === 'FRAME_OVERFLOW')) {
      diagnostics.push(
        diagnostic(
          'FRAME_OVERFLOW',
          graph.nodes.map((node) => node.id),
        ),
      );
    }
  }
  const cyclic = graph.edges.filter((edge) => edge.feedback).map((edge) => edge.from);
  if (cyclic.length) diagnostics.push(diagnostic('CYCLE_DETECTED', [...new Set(cyclic)]));
  for (const path of paths) {
    for (const node of graph.nodes) {
      if (node.id === path.from || node.id === path.to) continue;
      const box = frames.get(node.id);
      if (box && edgeHitsNode(path.path, box)) {
        diagnostics.push(diagnostic('EDGE_COLLISION', [path.from, path.to, node.id]));
      }
    }
  }
  const labels = paths.flatMap((path) => {
    if (path.role === 'stem' || path.role === 'bus') return [];
    const edge = graph.edges[path.index] || graph.edges.find((item) => item.index === path.index);
    if (!edge?.label) return [];
    const size = estimateEdgeLabel(edge.label);
    return [
      {
        id: edgeKey(path.from, path.to, path.index),
        box: {
          x: path.label.x - size.width / 2,
          y: path.label.y - size.height + 4,
          width: size.width,
          height: size.height,
        },
      },
    ];
  });
  for (const label of labels) {
    for (const node of graph.nodes) {
      const box = frames.get(node.id);
      if (box && overlaps(label.box, box))
        diagnostics.push(diagnostic('EDGE_LABEL_COLLISION', [node.id]));
    }
    for (const other of labels) {
      if (other.id > label.id && overlaps(label.box, other.box)) {
        diagnostics.push(diagnostic('EDGE_LABEL_COLLISION', [label.id, other.id]));
      }
    }
  }
  return diagnostics;
}
