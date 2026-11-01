import { FLOW, type FlowGraph, type FlowNodeMeasure } from './types.ts';

export function estimateNodeHeight(markdown: string) {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, 'コード')
    .replace(/[#>*_`+\-]/g, '')
    .trim();
  const lines = plain
    .split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 24)), 0);
  return Math.max(76, Math.min(190, 43 + lines * 20));
}

export function measureNodes(graph: FlowGraph, measuredHeights: number[] = []): FlowNodeMeasure[] {
  const horizontal = graph.direction === 'right' || graph.direction === 'left';
  return graph.nodes.map((node, i) => {
    const width = node.width ?? (horizontal ? FLOW.PREFERRED_WIDTH : FLOW.VERTICAL_WIDTH);
    const height = node.height ?? measuredHeights[i] ?? estimateNodeHeight(node.markdown);
    return {
      id: node.id,
      minWidth: node.width ?? FLOW.MIN_WIDTH,
      preferredWidth: width,
      maxWidth: node.width ?? FLOW.MAX_WIDTH,
      measuredHeight: height,
      width,
      height,
    };
  });
}
