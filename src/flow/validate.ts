import {
  diagnostic,
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
  _paths: FlowEdgePath[],
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
  return diagnostics;
}
