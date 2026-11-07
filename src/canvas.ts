import { atAttributes, finite, choice } from './markdown/attributes.mjs';
export { atAttributes, finite, choice } from './markdown/attributes.mjs';
import { svgElement } from './svg.ts';
import type { RenderContext } from './directives';
import { layoutFlowFromCanvas } from './flow/layout.ts';
import { estimateNodeHeight } from './flow/measure.ts';
import { routeFreeEdges } from './flow/route.ts';
import { fromCanvasScene } from './flow/normalize.ts';
import { measureBorderBox, sceneRatio } from './diagram/measure.ts';
import { FLOW, FLOW_DIAGNOSTIC_MESSAGE, FLOW_ROUTES, type FlowDiagnostic } from './flow/types.ts';

export type CanvasDirection = 'right' | 'left' | 'down' | 'up';
export type CanvasLayout = 'flow' | 'free';
export type CanvasRoute = 'auto' | 'curve' | 'straight' | 'elbow';
export type CanvasArrows = 'none' | 'start' | 'end' | 'both';
export type CanvasShape = 'card' | 'ellipse' | 'diamond';
export type CanvasFill = 'solid' | 'none';

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
  shape: CanvasShape;
  fill: CanvasFill;
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
  arrows: CanvasArrows;
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

let canvasSequence = 0;

function diamondOutline() {
  const outline = svgElement('svg', {
    class: 'canvas-diamond-stroke',
    viewBox: '0 0 1 1',
    preserveAspectRatio: 'none',
    'aria-hidden': 'true',
  });
  outline.append(svgElement('polygon', { points: '0.5,0 1,0.5 0.5,1 0,0.5' }));
  return outline;
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

/** Mount an already-parsed canvas scene and keep its SVG connection layer in sync. */
export function mountCanvasScene(
  element: HTMLElement,
  scene: CanvasScene,
  context: RenderContext,
): { update: () => void; dispose: () => void } {
  const uid = `milo-canvas-${++canvasSequence}`;
  element.classList.add('milo-canvas', `canvas-layout-${scene.options.layout}`);
  element.style.aspectRatio = `${scene.options.width} / ${scene.options.height}`;
  const svg = svgElement('svg', {
    class: 'canvas-connections',
    viewBox: `0 0 ${scene.options.width} ${scene.options.height}`,
    'aria-hidden': 'true',
  }) as SVGSVGElement;
  const flowMarks = scene.options.layout === 'flow';
  const defs = svgElement('defs', {}),
    marker = svgElement('marker', {
      id: `${uid}-arrow`,
      viewBox: '0 0 10 10',
      refX: 10,
      refY: 5,
      markerWidth: flowMarks ? 5 : 7,
      markerHeight: flowMarks ? 5 : 7,
      orient: 'auto-start-reverse',
    });
  marker.append(svgElement('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'canvas-arrow-head' }));
  defs.append(marker);
  svg.append(defs);
  const content = document.createElement('div');
  content.className = 'canvas-content';
  const elements = scene.nodes.map((node) => {
    const item = document.createElement('section');
    item.className = `canvas-node canvas-shape-${node.shape} canvas-tone-${node.tone}${node.fill === 'none' ? ' canvas-fill-none' : ''}`;
    item.dataset.canvasNode = node.id;
    if (context.renderMarkdown) item.innerHTML = context.renderMarkdown(node.markdown);
    else item.textContent = node.markdown;
    if (node.shape === 'diamond') item.prepend(diamondOutline());
    content.append(item);
    return item;
  });
  const overflowHint = document.createElement('div');
  overflowHint.className = 'canvas-overflow-hint';
  overflowHint.hidden = true;
  content.append(overflowHint);
  element.replaceChildren(svg, content);

  let disposed = false;
  const draw = () => {
    if (disposed) return;
    const ratio = sceneRatio(element, scene.options.width);
    const atWidth = new Map<number, number[]>();
    const preferredWidth = scene.options.layout === 'free' ? 230 : FLOW.PREFERRED_WIDTH;
    const candidates = scene.options.layout === 'free' ? [preferredWidth] : FLOW.WIDTH_CANDIDATES;
    for (const candidate of candidates) {
      elements.forEach((item, i) => {
        const width = scene.nodes[i].width ?? candidate;
        item.style.width = `${(width / scene.options.width) * 100}%`;
        item.style.minHeight = '';
        item.style.height = '';
      });
      atWidth.set(
        candidate,
        elements.map((item, i) => {
          if (scene.nodes[i].height !== undefined) return scene.nodes[i].height!;
          const height = measureBorderBox(item).height * ratio;
          return height > 1 ? height : estimatedHeight(scene.nodes[i]);
        }),
      );
    }
    const measured = { heights: atWidth.get(preferredWidth) || [], atWidth };
    const layout = scene.options.layout === 'flow' ? layoutFlowFromCanvas(scene, measured) : null;
    scene.options.height = layout?.height ?? canvasHeight(scene, measured.heights);
    element.style.aspectRatio = `${scene.options.width} / ${scene.options.height}`;
    svg.setAttribute('viewBox', `0 0 ${scene.options.width} ${scene.options.height}`);
    const frames = layout
      ? scene.nodes.map((node) => layout.nodeFrames.get(node.id)!)
      : layoutCanvas(scene, measured.heights);
    elements.forEach((item, i) => {
      const frame = frames[i];
      item.style.left = `${(frame.x / scene.options.width) * 100}%`;
      item.style.top = `${(frame.y / scene.options.height) * 100}%`;
      item.style.width = `${(frame.width / scene.options.width) * 100}%`;
      item.style.minHeight = `${(frame.height / scene.options.height) * 100}%`;
      item.style.height = `${(frame.height / scene.options.height) * 100}%`;
    });
    svg.querySelector('.canvas-edge-layer')?.remove();
    const layer = svgElement('g', { class: 'canvas-edge-layer' });
    const byId = new Map(scene.nodes.map((node, i) => [node.id, frames[i]]));
    const paths = layout?.edgePaths ?? routeFreeEdges(fromCanvasScene(scene), byId);
    const routed = paths.map((item) => ({ item, edge: scene.edges[item.index] }));
    const labeled = new Set<number>();
    for (const { item, edge } of routed) {
      if (!edge) continue;
      const arrows = item.arrows ?? edge.arrows;
      const attrs: Record<string, string | number> = {
        d: item.path,
        'data-edge-from': item.from,
        'data-edge-to': item.to,
        'data-edge-role': item.role || 'edge',
        class: `canvas-edge canvas-edge-${edge.tone}${edge.dashed ? ' is-dashed' : ''}`,
      };
      if (arrows === 'end' || arrows === 'both') attrs['marker-end'] = `url(#${uid}-arrow)`;
      if (arrows === 'start' || arrows === 'both') attrs['marker-start'] = `url(#${uid}-arrow)`;
      layer.append(svgElement('path', attrs));
      if (edge.label && item.role !== 'stem' && item.role !== 'bus' && !labeled.has(item.index)) {
        labeled.add(item.index);
        layer.append(
          svgElement(
            'text',
            {
              x: item.label.x,
              y: item.label.y,
              class: 'canvas-edge-label',
              'text-anchor': 'middle',
            },
            edge.label,
          ),
        );
      }
    }
    svg.append(layer);
    const diagnostics = [...(layout?.diagnostics || [])];
    elements.forEach((item, i) => {
      const frame = frames[i];
      if (frame && measureBorderBox(item).height * ratio > frame.height + 2) {
        diagnostics.push({
          code: 'TEXT_OVERFLOW',
          severity: 'warning',
          nodeIds: [scene.nodes[i].id],
          message: FLOW_DIAGNOSTIC_MESSAGE.TEXT_OVERFLOW,
        });
      }
    });
    const seen = new Set<string>();
    const unique = diagnostics.filter((item) => {
      if (item.code === 'CYCLE_DETECTED') return false;
      if (seen.has(item.code)) return false;
      seen.add(item.code);
      return true;
    });
    overflowHint.hidden = unique.length === 0;
    overflowHint.textContent = unique[0]?.message || '';
    element.classList.toggle('is-overflow', unique.length > 0);
    if (unique.length)
      element.setAttribute('data-canvas-overflow', unique.map((item) => item.code).join(' '));
    else element.removeAttribute('data-canvas-overflow');
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

/** Mount an HTML-in-Canvas scene and keep its SVG connection layer in sync. */
export function mountCanvas(
  element: HTMLElement,
  source: string,
  rawOptions: string,
  context: RenderContext,
): { update: () => void; dispose: () => void } {
  return mountCanvasScene(element, parseCanvas(source, rawOptions), context);
}
