import type { MountedDirective, RenderContext } from './directives';

export type CanvasDirection = 'right' | 'left' | 'down' | 'up';
export type CanvasLayout = 'flow' | 'free';
export type CanvasRoute = 'curve' | 'straight' | 'elbow';

interface CanvasOptions {
  layout: CanvasLayout;
  direction: CanvasDirection;
  width: number;
  height: number;
  autoHeight: boolean;
  gap: number;
  route: CanvasRoute;
}

interface CanvasNode {
  id: string;
  markdown: string;
  shape: 'card' | 'round' | 'ellipse' | 'diamond' | 'plain';
  tone: 'default' | 'accent' | 'muted' | 'dark';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  dx: number;
  dy: number;
  pinned: boolean;
}

interface CanvasEdge {
  from: string;
  to: string;
  label: string;
  route?: CanvasRoute;
  tone: 'default' | 'accent' | 'muted';
  dashed: boolean;
}

export interface CanvasScene {
  options: CanvasOptions;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface CanvasFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

const NS = 'http://www.w3.org/2000/svg';
let canvasSequence = 0;

function finite(value: string | undefined, fallback?: number): number | undefined {
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`数値を確認してください: ${value}`);
  return number;
}

function choice<T extends string>(
  value: string | undefined,
  choices: readonly T[],
  fallback: T,
  name: string,
): T {
  if (value === undefined || value === '') return fallback;
  if ((choices as readonly string[]).includes(value)) return value as T;
  throw new Error(`${name} は ${choices.join(' / ')} から選んでください。`);
}

/** Parse the compact attribute syntax shared by canvas, node and edge markers. */
export function atAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  let rest = source.trim();
  const id = /^#([A-Za-z][\w-]*)/.exec(rest);
  if (id) {
    attributes.id = id[1];
    rest = rest.slice(id[0].length).trim();
  }
  const pattern = /^([\w-]+)(?:\s*=\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s}]+)))?/;
  while (rest) {
    const match = pattern.exec(rest);
    if (!match) throw new Error(`設定の書き方を確認してください: ${rest}`);
    attributes[match[1]] = match[2] ?? match[3] ?? match[4] ?? 'true';
    rest = rest.slice(match[0].length).trim();
  }
  return attributes;
}

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
    shape: choice(attrs.shape, ['card', 'round', 'ellipse', 'diamond', 'plain'], 'card', 'shape'),
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
    route: attrs.route
      ? choice<CanvasRoute>(attrs.route, ['curve', 'straight', 'elbow'], 'curve', 'route')
      : undefined,
    tone: choice(attrs.tone, ['default', 'accent', 'muted'], 'default', 'tone'),
    dashed: attrs.dashed === 'true',
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
    gap: finite(attrs.gap, 54)!,
    route: choice(attrs.route, ['curve', 'straight', 'elbow'], 'curve', 'route'),
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

function estimatedHeight(node: CanvasNode) {
  const plain = node.markdown
    .replace(/```[\s\S]*?```/g, 'コード')
    .replace(/[#>*_`+\-]/g, '')
    .trim();
  const lines = plain
    .split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 24)), 0);
  return Math.max(76, Math.min(190, 43 + lines * 20));
}

function ranks(scene: CanvasScene) {
  const index = new Map(scene.nodes.map((node, i) => [node.id, i]));
  const incoming = scene.nodes.map(() => 0);
  const outgoing = scene.nodes.map(() => [] as number[]);
  for (const edge of scene.edges) {
    const from = index.get(edge.from)!,
      to = index.get(edge.to)!;
    incoming[to]++;
    outgoing[from].push(to);
  }
  const queue = incoming.map((count, i) => (count ? -1 : i)).filter((i) => i >= 0);
  const rank = scene.nodes.map(() => 0);
  const seen = new Set<number>();
  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of outgoing[current]) {
      rank[next] = Math.max(rank[next], rank[current] + 1);
      incoming[next]--;
      if (!incoming[next]) queue.push(next);
    }
  }
  // Cycles remain useful diagrams: put unresolved nodes in authored order.
  let last = Math.max(0, ...rank);
  scene.nodes.forEach((_, i) => {
    if (!seen.has(i)) rank[i] = ++last;
  });
  // With no edges, authored order is the flow.
  if (!scene.edges.length) rank.forEach((_, i) => (rank[i] = i));
  return rank;
}

/** Resolve flow height from its measured node contents; free and explicit heights stay fixed. */
export function canvasHeight(scene: CanvasScene, measured: number[] = []): number {
  if (!scene.options.autoHeight) return scene.options.height;
  const horizontal = scene.options.direction === 'right' || scene.options.direction === 'left',
    rank = ranks(scene),
    groups = Array.from({ length: Math.max(...rank) + 1 }, () => [] as number[]);
  rank.forEach((value, i) => groups[value].push(i));
  const heights = scene.nodes.map((node, i) => node.height ?? measured[i] ?? estimatedHeight(node));
  const contentHeight = horizontal
    ? Math.max(
        ...groups.map(
          (members) =>
            members.reduce((sum, i) => sum + heights[i], 0) +
            scene.options.gap * Math.max(0, members.length - 1),
        ),
      )
    : groups.reduce((sum, members) => sum + Math.max(...members.map((i) => heights[i])), 0) +
      scene.options.gap * Math.max(0, groups.length - 1);
  return Math.max(160, Math.ceil(contentHeight + 68));
}

/** Deterministic scene layout; measured heights can be supplied by the DOM renderer. */
export function layoutCanvas(scene: CanvasScene, measured: number[] = []): CanvasFrame[] {
  const { options, nodes } = scene;
  const horizontal = options.direction === 'right' || options.direction === 'left';
  if (options.layout === 'free') {
    return nodes.map((node, i) => ({
      x: (node.x ?? 36 + (i % 3) * 300) + node.dx,
      y: (node.y ?? 32 + Math.floor(i / 3) * 150) + node.dy,
      width: node.width ?? 230,
      height: node.height ?? measured[i] ?? estimatedHeight(node),
    }));
  }

  const rank = ranks(scene),
    rankCount = Math.max(...rank) + 1,
    groups = Array.from({ length: rankCount }, () => [] as number[]);
  rank.forEach((value, i) => groups[value].push(i));
  const primarySize = horizontal ? options.width : options.height,
    crossSize = horizontal ? options.height : options.width,
    padding = 34;
  const sizes = nodes.map((node, i) => ({
      width: node.width ?? (horizontal ? 220 : 250),
      height: node.height ?? measured[i] ?? estimatedHeight(node),
    })),
    groupPrimary = groups.map((members) =>
      Math.max(...members.map((i) => (horizontal ? sizes[i].width : sizes[i].height))),
    ),
    occupied = groupPrimary.reduce((sum, value) => sum + value, 0),
    primaryGap =
      rankCount === 1
        ? 0
        : Math.max(options.gap, (primarySize - padding * 2 - occupied) / (rankCount - 1)),
    primaryPositions: number[] = [];
  let primaryCursor = padding;
  groupPrimary.forEach((length, i) => {
    primaryPositions.push(primaryCursor);
    primaryCursor += length + (i < rankCount - 1 ? primaryGap : 0);
  });
  const frames = nodes.map(() => ({ x: 0, y: 0, width: 0, height: 0 }));
  groups.forEach((members, groupIndex) => {
    const crossLengths = members.map((i) => (horizontal ? sizes[i].height : sizes[i].width));
    const total =
      crossLengths.reduce((sum, value) => sum + value, 0) + options.gap * (members.length - 1);
    let cross = Math.max(padding, (crossSize - total) / 2);
    members.forEach((nodeIndex, memberIndex) => {
      const node = nodes[nodeIndex],
        size = sizes[nodeIndex],
        rawPrimary = primaryPositions[groupIndex],
        primary =
          options.direction === 'left' || options.direction === 'up'
            ? primarySize - rawPrimary - (horizontal ? size.width : size.height)
            : rawPrimary;
      let x = horizontal ? primary : cross,
        y = horizontal ? cross : primary;
      if (node.pinned && node.x !== undefined) x = node.x;
      if (node.pinned && node.y !== undefined) y = node.y;
      frames[nodeIndex] = {
        x: x + node.dx,
        y: y + node.dy,
        width: size.width,
        height: size.height,
      };
      cross += crossLengths[memberIndex] + options.gap;
    });
  });
  return frames;
}

function svgElement(tag: string, attrs: Record<string, string | number>, text?: string) {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}

function connection(from: CanvasFrame, to: CanvasFrame, route: CanvasRoute) {
  const a = { x: from.x + from.width / 2, y: from.y + from.height / 2 },
    b = { x: to.x + to.width / 2, y: to.y + to.height / 2 },
    dx = b.x - a.x,
    dy = b.y - a.y,
    horizontal = Math.abs(dx) >= Math.abs(dy);
  let start, end;
  if (horizontal) {
    start = { x: a.x + (Math.sign(dx || 1) * from.width) / 2, y: a.y };
    end = { x: b.x - (Math.sign(dx || 1) * to.width) / 2, y: b.y };
  } else {
    start = { x: a.x, y: a.y + (Math.sign(dy || 1) * from.height) / 2 };
    end = { x: b.x, y: b.y - (Math.sign(dy || 1) * to.height) / 2 };
  }
  let path: string;
  if (route === 'straight') path = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  else if (route === 'elbow') {
    path = horizontal
      ? `M ${start.x} ${start.y} H ${(start.x + end.x) / 2} V ${end.y} H ${end.x}`
      : `M ${start.x} ${start.y} V ${(start.y + end.y) / 2} H ${end.x} V ${end.y}`;
  } else {
    const bend = horizontal ? Math.max(35, Math.abs(dx) * 0.42) : Math.max(35, Math.abs(dy) * 0.42);
    path = horizontal
      ? `M ${start.x} ${start.y} C ${start.x + Math.sign(dx || 1) * bend} ${start.y}, ${end.x - Math.sign(dx || 1) * bend} ${end.y}, ${end.x} ${end.y}`
      : `M ${start.x} ${start.y} C ${start.x} ${start.y + Math.sign(dy || 1) * bend}, ${end.x} ${end.y - Math.sign(dy || 1) * bend}, ${end.x} ${end.y}`;
  }
  return { path, label: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 8 } };
}

/** Mount an HTML-in-Canvas scene and keep its SVG connection layer in sync. */
export function mountCanvas(
  element: HTMLElement,
  source: string,
  rawOptions: string,
  context: RenderContext,
): MountedDirective {
  const scene = parseCanvas(source, rawOptions),
    uid = `milo-canvas-${++canvasSequence}`;
  element.className = `milo-canvas canvas-layout-${scene.options.layout}`;
  element.style.aspectRatio = `${scene.options.width} / ${scene.options.height}`;
  const svg = svgElement('svg', {
    class: 'canvas-connections',
    viewBox: `0 0 ${scene.options.width} ${scene.options.height}`,
    'aria-hidden': 'true',
  }) as SVGSVGElement;
  const defs = svgElement('defs', {}),
    marker = svgElement('marker', {
      id: `${uid}-arrow`,
      viewBox: '0 0 10 10',
      refX: 8.2,
      refY: 5,
      markerWidth: 7,
      markerHeight: 7,
      orient: 'auto-start-reverse',
    });
  marker.append(svgElement('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'canvas-arrow-head' }));
  defs.append(marker);
  svg.append(defs);
  const content = document.createElement('div');
  content.className = 'canvas-content';
  const elements = scene.nodes.map((node) => {
    const item = document.createElement('section');
    item.className = `canvas-node canvas-shape-${node.shape} canvas-tone-${node.tone}`;
    item.dataset.canvasNode = node.id;
    if (context.renderMarkdown) item.innerHTML = context.renderMarkdown(node.markdown);
    else item.textContent = node.markdown;
    content.append(item);
    return item;
  });
  element.replaceChildren(svg, content);

  let disposed = false;
  const draw = () => {
    if (disposed) return;
    elements.forEach((item, i) => {
      const vertical = scene.options.direction === 'down' || scene.options.direction === 'up';
      const width = scene.nodes[i].width ?? (vertical ? 250 : 220);
      item.style.width = `${(width / scene.options.width) * 100}%`;
      item.style.minHeight = '';
    });
    const bounds = element.getBoundingClientRect();
    const ratio = bounds.width ? scene.options.width / bounds.width : 1;
    const measured = elements.map((item, i) => {
      if (scene.nodes[i].height !== undefined) return scene.nodes[i].height!;
      const height = item.scrollHeight * ratio;
      return height > 1 ? height : estimatedHeight(scene.nodes[i]);
    });
    scene.options.height = canvasHeight(scene, measured);
    element.style.aspectRatio = `${scene.options.width} / ${scene.options.height}`;
    svg.setAttribute('viewBox', `0 0 ${scene.options.width} ${scene.options.height}`);
    const frames = layoutCanvas(scene, measured);
    elements.forEach((item, i) => {
      const frame = frames[i];
      item.style.left = `${(frame.x / scene.options.width) * 100}%`;
      item.style.top = `${(frame.y / scene.options.height) * 100}%`;
      item.style.width = `${(frame.width / scene.options.width) * 100}%`;
      item.style.minHeight = `${(frame.height / scene.options.height) * 100}%`;
    });
    svg.querySelector('.canvas-edge-layer')?.remove();
    const layer = svgElement('g', { class: 'canvas-edge-layer' });
    const byId = new Map(scene.nodes.map((node, i) => [node.id, frames[i]]));
    for (const edge of scene.edges) {
      const geometry = connection(
        byId.get(edge.from)!,
        byId.get(edge.to)!,
        edge.route || scene.options.route,
      );
      layer.append(
        svgElement('path', {
          d: geometry.path,
          class: `canvas-edge canvas-edge-${edge.tone}${edge.dashed ? ' is-dashed' : ''}`,
          'marker-end': `url(#${uid}-arrow)`,
        }),
      );
      if (edge.label)
        layer.append(
          svgElement(
            'text',
            {
              x: geometry.label.x,
              y: geometry.label.y,
              class: 'canvas-edge-label',
              'text-anchor': 'middle',
            },
            edge.label,
          ),
        );
    }
    svg.append(layer);
  };
  draw();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw);
  observer?.observe(element);
  elements.forEach((item) => observer?.observe(item));
  return {
    update: draw,
    dispose: () => {
      disposed = true;
      observer?.disconnect();
    },
  };
}
