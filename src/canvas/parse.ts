import { atAttributes, finite, choice } from '../markdown/attributes.mjs';
import { FLOW, FLOW_ROUTES } from '../flow/types.ts';
import type { CanvasEdge, CanvasNode, CanvasOptions, CanvasRoute, CanvasScene } from './types.ts';

function nodeFrom(attrs: Record<string, string>, markdown: string, index: number): CanvasNode {
  const frame = attrs.frame?.split(',').map((part) => finite(part.trim()));
  if (frame && (frame.length !== 4 || frame.some((value) => value === undefined)))
    throw new Error(
      `node ${attrs.id || index + 1} の frame は x,y,width,height で指定してください。`,
    );
  const width = finite(attrs.width, frame?.[2]);
  const height = finite(attrs.height, frame?.[3]);
  if ((width !== undefined && width <= 0) || (height !== undefined && height <= 0))
    throw new Error('node の width と height は正の数にしてください。');
  return {
    id: attrs.id || `node-${index + 1}`,
    markdown: markdown.trim(),
    shape: choice(attrs.shape, ['card', 'ellipse', 'diamond'], 'card', 'shape'),
    fill: choice(attrs.fill, ['solid', 'none'], 'solid', 'fill'),
    tone: choice(attrs.tone, ['default', 'accent', 'muted', 'dark'], 'default', 'tone'),
    x: finite(attrs.x, frame?.[0]),
    y: finite(attrs.y, frame?.[1]),
    width,
    height,
    dx: finite(attrs.dx, 0)!,
    dy: finite(attrs.dy, 0)!,
    pinned: attrs.pinned === 'true',
  };
}

function edgeFrom(attrs: Record<string, string>): CanvasEdge {
  if (!attrs.from || !attrs.to) throw new Error('edge には from と to が必要です。');
  return {
    from: attrs.from,
    to: attrs.to,
    label: attrs.label || '',
    route: attrs.route ? choice<CanvasRoute>(attrs.route, FLOW_ROUTES, 'auto', 'route') : undefined,
    tone: choice(attrs.tone, ['default', 'accent', 'muted'], 'default', 'tone'),
    dashed: attrs.dashed === 'true',
    arrows: choice(attrs.arrows, ['none', 'start', 'end', 'both'], 'end', 'arrows'),
  };
}

/** Parse the contents of an @canvas block without parsing its Markdown node bodies. */
export function parseCanvas(source: string, rawOptions = ''): CanvasScene {
  const attrs = atAttributes(rawOptions);
  const layout = choice(attrs.layout, ['flow', 'free'], 'flow', 'layout');
  if (attrs.height === 'auto' && layout === 'free')
    throw new Error('freeレイアウトのheightは数値で指定してください。');
  const autoHeight = layout === 'flow' && (attrs.height === undefined || attrs.height === 'auto');
  const options: CanvasOptions = {
    layout,
    direction: choice(attrs.direction, ['right', 'left', 'down', 'up'], 'right', 'direction'),
    width: finite(attrs.width, 1000)!,
    height: autoHeight ? 420 : finite(attrs.height, 420)!,
    autoHeight,
    gap: finite(attrs.gap, FLOW.PREFERRED_GAP)!,
    route: choice(attrs.route, FLOW_ROUTES, 'auto', 'route'),
  };
  if (options.width <= 0 || options.height <= 0 || options.gap < 0)
    throw new Error('canvas の width / height / gap を確認してください。');

  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];
  const loose: string[] = [];
  const pendingSequential: number[] = [];
  let current: { attrs: Record<string, string>; body: string[] } | null = null,
    markdownFence = '';

  const addNode = (nodeAttrs: Record<string, string>, body: string[]) => {
    const node = nodeFrom(nodeAttrs, body.join('\n'), nodes.length);
    if (!node.markdown) throw new Error(`node ${node.id} の内容が空です。`);
    if (nodes.some((item) => item.id === node.id))
      throw new Error(`node IDが重複しています: ${node.id}`);
    nodes.push(node);
    const index = nodes.length - 1;
    for (let i = pendingSequential.length - 1; i >= 0; i--) {
      const from = pendingSequential[i];
      if (from < index) {
        edges.push(edgeFrom({ from: nodes[from].id, to: node.id }));
        pendingSequential.splice(i, 1);
      }
    }
  };
  const flushLoose = () => {
    if (loose.some((line) => line.trim())) addNode({}, loose.splice(0));
    else loose.length = 0;
  };
  const flushCurrent = () => {
    if (!current) return;
    addNode(current.attrs, current.body);
    current = null;
  };
  const appendMarkdown = (line: string) => {
    if (current) current.body.push(line);
    else loose.push(line);
  };

  for (const line of lines) {
    const text = line.trim();
    if (markdownFence) {
      appendMarkdown(line);
      if (new RegExp(`^${markdownFence[0]}{${markdownFence.length},}\\s*$`).test(text))
        markdownFence = '';
      continue;
    }
    const openingFence = /^(?:`{3,}|~{3,})/.exec(text);
    if (openingFence) {
      markdownFence = openingFence[0];
      appendMarkdown(line);
      continue;
    }
    const node = /^@node\s+([A-Za-z][\w-]*)(?:\s+([\s\S]*))?\s*$/.exec(text);
    if (node) {
      flushCurrent();
      flushLoose();
      current = { attrs: { ...atAttributes(node[2] || ''), id: node[1] }, body: [] };
      continue;
    }
    const edge = /^@edge\s+([A-Za-z][\w-]*)\s*-->\s*([A-Za-z][\w-]*)(?:\s+([\s\S]*))?\s*$/.exec(
      text,
    );
    if (edge) {
      flushCurrent();
      flushLoose();
      edges.push(
        edgeFrom({
          ...atAttributes(edge[3] || ''),
          from: edge[1],
          to: edge[2],
        }),
      );
      continue;
    }
    if (text === '-->') {
      flushCurrent();
      flushLoose();
      if (!nodes.length) throw new Error('矢印の前にnodeまたはMarkdownを書いてください。');
      pendingSequential.push(nodes.length - 1);
      continue;
    }
    appendMarkdown(line);
  }
  flushCurrent();
  flushLoose();
  if (pendingSequential.length) throw new Error('矢印の後に接続先のnodeがありません。');
  if (!nodes.length) throw new Error('canvasにMarkdownまたはnodeがありません。');
  const ids = new Set(nodes.map((node) => node.id));
  for (const edge of edges) {
    if (!ids.has(edge.from)) throw new Error(`edgeの接続元が見つかりません: ${edge.from}`);
    if (!ids.has(edge.to)) throw new Error(`edgeの接続先が見つかりません: ${edge.to}`);
  }
  return { options, nodes, edges };
}
