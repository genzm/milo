import { esc, type RenderContext } from './directives';
import {
  atAttributes,
  choice,
  connection,
  finite,
  mountCanvasScene,
  type CanvasArrows,
  type CanvasScene,
} from './canvas';

export type DiagramLayoutKind = 'ring' | 'flow' | 'radial';
export type DiagramLevel = 'none' | 'high' | 'medium' | 'low';
export type DiagramLinkKind = 'undirected' | 'forward' | 'both';
export type DiagramStart = 'top' | 'right' | 'bottom' | 'left';
export type DiagramOrder = 'ccw' | 'cw';
export type DiagramConnect = 'none' | 'cycle';

export interface DiagramItem {
  id: string;
  title: string;
  badge: string;
  level: DiagramLevel;
  shape: 'vertex' | 'card';
  markdown: string;
}

export interface DiagramLink {
  from: string;
  to: string;
  kind: DiagramLinkKind;
  label: string;
}

export interface DiagramOptions {
  layout: DiagramLayoutKind;
  connect: DiagramConnect;
  start: DiagramStart;
  order: DiagramOrder;
  direction: 'right' | 'left' | 'down' | 'up';
  center: string;
  width: number;
  height: number;
}

export interface DiagramScene {
  options: DiagramOptions;
  items: DiagramItem[];
  links: DiagramLink[];
}

export interface DiagramBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiagramPlacedItem extends DiagramBox {
  id: string;
  kind: 'vertex' | 'card';
  label?: DiagramBox;
}

export interface DiagramPlacedLink {
  from: string;
  to: string;
  kind: DiagramLinkKind;
  label: string;
  path: string;
  labelAt: { x: number; y: number };
}

export interface DiagramLayout {
  width: number;
  height: number;
  items: DiagramPlacedItem[];
  links: DiagramPlacedLink[];
}

const NS = 'http://www.w3.org/2000/svg';
const VERTEX = 92;
const VERTEX_R = VERTEX / 2;
const LABEL_GAP = 18;
const PAD = 28;
let diagramSequence = 0;

const START_PHI: Record<DiagramStart, number> = {
  top: 0,
  right: Math.PI / 2,
  bottom: Math.PI,
  left: -Math.PI / 2,
};

function svgElement(tag: string, attrs: Record<string, string | number>, text?: string) {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}

function overlaps(a: DiagramBox, b: DiagramBox, gap = 8) {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

function clampBox(box: DiagramBox, width: number, height: number) {
  box.x = Math.min(Math.max(PAD, box.x), Math.max(PAD, width - PAD - box.width));
  box.y = Math.min(Math.max(PAD, box.y), Math.max(PAD, height - PAD - box.height));
}

function pairKey(from: string, to: string) {
  return from < to ? `${from}::${to}` : `${to}::${from}`;
}

function angle(i: number, n: number, start: DiagramStart, order: DiagramOrder) {
  const step = (2 * Math.PI) / Math.max(n, 1);
  const sign = order === 'cw' ? 1 : -1;
  return START_PHI[start] + sign * i * step;
}

function pointOnRing(cx: number, cy: number, radius: number, phi: number) {
  return { x: cx + radius * Math.sin(phi), y: cy - radius * Math.cos(phi) };
}

export function estimateLabelSize(item: DiagramItem) {
  const font = 27;
  let units = 0;
  for (const ch of item.title) units += /[\u3000-\u9fff]/.test(ch) ? 1 : 0.55;
  const width = Math.min(260, Math.max(96, units * font + 12));
  const lines = Math.max(1, Math.ceil((units * font) / 240));
  const extra = item.markdown.trim() ? Math.min(64, 22 + item.markdown.trim().length * 0.4) : 0;
  return { width, height: lines * font * 1.35 + extra };
}

export function estimateCardSize(item: DiagramItem, center: boolean) {
  const font = center ? 32 : 27;
  let units = 0;
  for (const ch of item.title) units += /[\u3000-\u9fff]/.test(ch) ? 1 : 0.55;
  return {
    width: Math.max(center ? 260 : 168, units * font + 64),
    height: font * 1.3 + 40,
  };
}

export function resolvedLinks(scene: DiagramScene): DiagramLink[] {
  const links = [...scene.links];
  if (scene.options.connect !== 'cycle' || scene.items.length < 2) return links;
  const directed = new Set(
    links.filter((link) => link.kind !== 'undirected').map((link) => pairKey(link.from, link.to)),
  );
  const seen = new Set(links.map((link) => pairKey(link.from, link.to)));
  const ringItems =
    scene.options.layout === 'radial' && scene.options.center
      ? scene.items.filter((item) => item.id !== scene.options.center)
      : scene.items;
  for (let i = 0; i < ringItems.length; i++) {
    const from = ringItems[i].id;
    const to = ringItems[(i + 1) % ringItems.length].id;
    if (from === to) continue;
    const key = pairKey(from, to);
    if (seen.has(key) || directed.has(key)) continue;
    seen.add(key);
    links.push({ from, to, kind: 'undirected', label: '' });
  }
  return links;
}

function parseLink(text: string): DiagramLink | null {
  const match = /^@link\s+([A-Za-z][\w-]*)\s*(<->|->|--)\s*([A-Za-z][\w-]*)(?:\s+([\s\S]*))?$/.exec(
    text,
  );
  if (!match) return null;
  const attrs = atAttributes(match[4] || '');
  const kind: DiagramLinkKind =
    match[2] === '<->' ? 'both' : match[2] === '->' ? 'forward' : 'undirected';
  return { from: match[1], to: match[3], kind, label: attrs.label || '' };
}

function itemFrom(
  attrs: Record<string, string>,
  markdown: string,
  index: number,
  layout: DiagramLayoutKind,
): DiagramItem {
  const title = (attrs.title || '').trim();
  if (!title) throw new Error(`@item ${attrs.id || index + 1} には title が必要です。`);
  const shape = choice(
    attrs.shape,
    ['vertex', 'card'] as const,
    layout === 'ring' ? 'vertex' : 'card',
    'shape',
  );
  return {
    id: attrs.id,
    title,
    badge: attrs.badge !== undefined ? attrs.badge : layout === 'ring' ? String(index + 1) : '',
    level: attrs.level
      ? choice(attrs.level, ['high', 'medium', 'low'] as const, 'high', 'level')
      : 'none',
    shape,
    markdown: markdown.trim(),
  };
}

/** Parse @diagram contents into items, links and layout options. */
export function parseDiagram(source: string, rawOptions = ''): DiagramScene {
  const attrs = atAttributes(rawOptions);
  if (attrs.layout === 'tree' || attrs.layout === 'free')
    throw new Error('layout は ring / flow / radial です。精密な配置は @canvas を使ってください。');
  const layout = choice(attrs.layout, ['ring', 'flow', 'radial'] as const, 'ring', 'layout');
  const options: DiagramOptions = {
    layout,
    connect: choice(
      attrs.connect,
      ['none', 'cycle'] as const,
      layout === 'ring' ? 'cycle' : 'none',
      'connect',
    ),
    start: choice(attrs.start, ['top', 'right', 'bottom', 'left'] as const, 'top', 'start'),
    order: choice(attrs.order, ['ccw', 'cw'] as const, 'ccw', 'order'),
    direction: choice(
      attrs.direction,
      ['right', 'left', 'down', 'up'] as const,
      'right',
      'direction',
    ),
    center: attrs.center || '',
    width: finite(attrs.width, 1000)!,
    height: finite(attrs.height, layout === 'radial' ? 620 : 500)!,
  };
  if (options.width <= 0 || options.height <= 0)
    throw new Error('diagram の width / height を確認してください。');

  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const items: DiagramItem[] = [];
  const links: DiagramLink[] = [];
  let current: { attrs: Record<string, string>; body: string[] } | null = null,
    markdownFence = '';

  const flush = () => {
    if (!current) return;
    items.push(itemFrom(current.attrs, current.body.join('\n'), items.length, layout));
    current = null;
  };

  for (const line of lines) {
    const text = line.trim();
    if (markdownFence) {
      current?.body.push(line);
      if (new RegExp(`^${markdownFence[0]}{${markdownFence.length},}\\s*$`).test(text))
        markdownFence = '';
      continue;
    }
    const openingFence = /^(?:`{3,}|~{3,})/.exec(text);
    if (openingFence) {
      markdownFence = openingFence[0];
      current?.body.push(line);
      continue;
    }
    const item = /^@item\s+([A-Za-z][\w-]*)(?:\s+([\s\S]*))?\s*$/.exec(text);
    if (item) {
      flush();
      current = { attrs: { ...atAttributes(item[2] || ''), id: item[1] }, body: [] };
      continue;
    }
    if (text.startsWith('@link')) {
      flush();
      const link = parseLink(text);
      if (!link) throw new Error(`接続の書き方を確認してください: ${text}`);
      links.push(link);
      continue;
    }
    if (!text) {
      current?.body.push(line);
      continue;
    }
    if (text.startsWith('@')) throw new Error(`diagram の中では使えません: ${text}`);
    if (!current) throw new Error('diagram の内容は @item か @link で書いてください。');
    current.body.push(line);
  }
  flush();
  if (!items.length) throw new Error('diagram には1つ以上の @item が必要です。');
  if (items.some((item, i) => items.findIndex((other) => other.id === item.id) !== i))
    throw new Error(
      `item IDが重複しています: ${items.find((item, i) => items.findIndex((other) => other.id === item.id) !== i)?.id}`,
    );
  if (options.layout === 'radial') options.center = options.center || items[0].id;
  if (options.layout === 'radial' && !items.some((item) => item.id === options.center))
    throw new Error(`center の item が見つかりません: ${options.center}`);
  const ids = new Set(items.map((item) => item.id));
  for (const link of links) {
    if (!ids.has(link.from)) throw new Error(`link の接続元が見つかりません: ${link.from}`);
    if (!ids.has(link.to)) throw new Error(`link の接続先が見つかりません: ${link.to}`);
  }
  return { options, items, links };
}

function labelOutside(
  vertex: { cx: number; cy: number; phi: number },
  size: { width: number; height: number },
) {
  const dx = Math.sin(vertex.phi);
  const dy = -Math.cos(vertex.phi);
  const half = (Math.abs(dx) * size.width + Math.abs(dy) * size.height) / 2;
  const dist = VERTEX_R + LABEL_GAP + half;
  return {
    x: vertex.cx + dx * dist - size.width / 2,
    y: vertex.cy + dy * dist - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

function layoutRing(
  scene: DiagramScene,
  labelSizes: { width: number; height: number }[],
): { items: DiagramPlacedItem[]; radius: number } {
  const { width, height, start, order } = scene.options;
  const n = scene.items.length;
  const cx = width / 2;
  const cy = height / 2;
  const sizes = scene.items.map((item, i) => {
    const raw = labelSizes[i] || estimateLabelSize(item);
    return { width: Math.min(200, raw.width), height: raw.height };
  });
  const minRadius = n < 2 ? 0 : VERTEX / (2 * Math.sin(Math.PI / n)) + 18;
  const maxLabel = Math.max(40, ...sizes.map((size) => size.height));
  const maxRadius = Math.min(width, height) / 2 - VERTEX_R - PAD - maxLabel;
  const radius = Math.max(minRadius, Math.min(Math.max(120, maxRadius), maxRadius));

  const items = scene.items.map((item, i) => {
    const phi = n === 1 ? 0 : angle(i, n, start, order);
    const center = n === 1 ? { x: cx, y: cy } : pointOnRing(cx, cy, radius, phi);
    return {
      id: item.id,
      kind: 'vertex' as const,
      x: center.x - VERTEX_R,
      y: center.y - VERTEX_R,
      width: VERTEX,
      height: VERTEX,
      label: labelOutside({ cx: center.x, cy: center.y, phi }, sizes[i]),
    };
  });

  for (let iter = 0; iter < 8; iter++) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i].label,
          b = items[j].label;
        if (!a || !b || !overlaps(a, b, 10)) continue;
        const push = 8;
        const phiA = n === 1 ? 0 : angle(i, n, start, order);
        const phiB = angle(j, n, start, order);
        a.x += Math.sin(phiA) * push;
        a.y -= Math.cos(phiA) * push;
        b.x += Math.sin(phiB) * push;
        b.y -= Math.cos(phiB) * push;
      }
    }
  }
  for (const item of items) if (item.label) clampBox(item.label, width, height);
  return { items, radius };
}

function rayHalf(size: { width: number; height: number }, phi: number) {
  return (Math.abs(Math.sin(phi)) * size.width + Math.abs(Math.cos(phi)) * size.height) / 2;
}

function layoutRadial(
  scene: DiagramScene,
  cardSizes: { width: number; height: number }[],
): DiagramPlacedItem[] {
  const { width, height, start, order, center } = scene.options;
  const cx = width / 2;
  const cy = height / 2;
  const centerIndex = scene.items.findIndex((item) => item.id === center);
  const satellites = scene.items
    .map((item, i) => ({ item, i }))
    .filter((entry) => entry.i !== centerIndex);
  let scale = 1;
  const sizeAt = (index: number, hub: boolean) => {
    const raw = cardSizes[index] || estimateCardSize(scene.items[index], hub);
    return { width: raw.width * scale, height: raw.height * scale };
  };
  const placed: DiagramPlacedItem[] = scene.items.map((item) => ({
    id: item.id,
    kind: 'card',
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  }));

  const placeHub = () => {
    const hub = sizeAt(centerIndex, true);
    placed[centerIndex] = {
      id: scene.items[centerIndex].id,
      kind: 'card',
      x: cx - hub.width / 2,
      y: cy - hub.height / 2,
      width: hub.width,
      height: hub.height,
    };
    return hub;
  };

  if (!satellites.length) {
    placeHub();
    return placed;
  }

  const metrics = (hub: { width: number; height: number }) => {
    let minR = 0;
    let maxR = Infinity;
    satellites.forEach((entry, orbit) => {
      const phi = angle(orbit, satellites.length, start, order);
      const sat = sizeAt(entry.i, false);
      minR = Math.max(minR, rayHalf(hub, phi) + rayHalf(sat, phi) + 28);
      const dx = Math.sin(phi);
      const dy = -Math.cos(phi);
      if (dx > 0.08) maxR = Math.min(maxR, (width - PAD - sat.width / 2 - cx) / dx);
      if (dx < -0.08) maxR = Math.min(maxR, (cx - PAD - sat.width / 2) / -dx);
      if (dy > 0.08) maxR = Math.min(maxR, (height - PAD - sat.height / 2 - cy) / dy);
      if (dy < -0.08) maxR = Math.min(maxR, (cy - PAD - sat.height / 2) / -dy);
    });
    return { minR, maxR };
  };

  let hub = placeHub();
  let { minR, maxR } = metrics(hub);
  while (minR > maxR && scale > 0.62) {
    scale *= 0.9;
    hub = placeHub();
    ({ minR, maxR } = metrics(hub));
  }
  const radius =
    Number.isFinite(maxR) && maxR > 0 ? Math.max(minR, Math.min(maxR, minR + 36)) : minR;
  satellites.forEach((entry, orbit) => {
    const size = sizeAt(entry.i, false);
    const phi = angle(orbit, satellites.length, start, order);
    const point = pointOnRing(cx, cy, radius, phi);
    placed[entry.i] = {
      id: entry.item.id,
      kind: 'card',
      x: point.x - size.width / 2,
      y: point.y - size.height / 2,
      width: size.width,
      height: size.height,
    };
  });
  for (const box of placed) clampBox(box, width, height);
  return placed;
}

function circlePath(from: DiagramBox, to: DiagramBox) {
  const a = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const b = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const dx = b.x - a.x,
    dy = b.y - a.y,
    dist = Math.hypot(dx, dy) || 1;
  const ra = Math.min(from.width, from.height) / 2;
  const rb = Math.min(to.width, to.height) / 2;
  const start = { x: a.x + (dx / dist) * ra, y: a.y + (dy / dist) * ra };
  const end = { x: b.x - (dx / dist) * rb, y: b.y - (dy / dist) * rb };
  return {
    path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
    labelAt: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 10 },
  };
}

function linkGeometry(
  from: DiagramPlacedItem,
  to: DiagramPlacedItem,
): { path: string; labelAt: { x: number; y: number } } {
  if (from.kind === 'vertex' && to.kind === 'vertex') return circlePath(from, to);
  const geometry = connection(from, to, 'straight');
  return { path: geometry.path, labelAt: geometry.label };
}

/** Deterministic placement for ring and radial diagrams. Flow uses the canvas engine. */
export function layoutDiagram(
  scene: DiagramScene,
  measured: {
    labels?: { width: number; height: number }[];
    cards?: { width: number; height: number }[];
  } = {},
): DiagramLayout {
  const { options } = scene;
  const items =
    options.layout === 'radial'
      ? layoutRadial(
          scene,
          measured.cards ||
            scene.items.map((item) => estimateCardSize(item, item.id === options.center)),
        )
      : layoutRing(scene, measured.labels || scene.items.map((item) => estimateLabelSize(item)))
          .items;
  const byId = new Map(items.map((item) => [item.id, item]));
  const links = resolvedLinks(scene).map((link) => {
    const geometry = linkGeometry(byId.get(link.from)!, byId.get(link.to)!);
    return { ...link, path: geometry.path, labelAt: geometry.labelAt };
  });
  return { width: options.width, height: options.height, items, links };
}

function levelClass(level: DiagramLevel) {
  return level === 'none' ? '' : ` diagram-level-${level}`;
}

function arrowsFor(kind: DiagramLinkKind): CanvasArrows {
  return kind === 'both' ? 'both' : kind === 'forward' ? 'end' : 'none';
}

function toCanvasScene(scene: DiagramScene): CanvasScene {
  const links = resolvedLinks(scene);
  return {
    options: {
      layout: 'flow',
      direction: scene.options.direction,
      width: scene.options.width,
      height: scene.options.height,
      autoHeight: true,
      gap: 54,
      route: 'straight',
    },
    nodes: scene.items.map((item) => ({
      id: item.id,
      markdown: item.markdown ? `### ${item.title}\n\n${item.markdown}` : `### ${item.title}`,
      shape: item.shape === 'vertex' ? 'ellipse' : 'round',
      tone:
        item.level === 'high'
          ? 'accent'
          : item.level === 'medium'
            ? 'muted'
            : item.level === 'low'
              ? 'default'
              : 'default',
      dx: 0,
      dy: 0,
      pinned: false,
    })),
    edges: links.map((link) => ({
      from: link.from,
      to: link.to,
      label: link.label,
      tone: 'default' as const,
      dashed: false,
      arrows: arrowsFor(link.kind),
    })),
  };
}

function applyBox(element: HTMLElement, box: DiagramBox, width: number, height: number) {
  element.style.left = `${(box.x / width) * 100}%`;
  element.style.top = `${(box.y / height) * 100}%`;
  element.style.width = `${(box.width / width) * 100}%`;
}

/** Mount @diagram as HTML nodes plus an SVG connection layer. */
export function mountDiagram(
  element: HTMLElement,
  source: string,
  rawOptions: string,
  context: RenderContext,
): { update: () => void; dispose: () => void } {
  const scene = parseDiagram(source, rawOptions);
  if (scene.options.layout === 'flow') {
    element.classList.add('milo-diagram', 'diagram-layout-flow');
    return mountCanvasScene(element, toCanvasScene(scene), context);
  }

  const uid = `milo-diagram-${++diagramSequence}`;
  element.className = `milo-diagram diagram-layout-${scene.options.layout}`;
  element.style.aspectRatio = `${scene.options.width} / ${scene.options.height}`;
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', scene.items.map((item) => item.title).join('、'));

  const svg = svgElement('svg', {
    class: 'diagram-connections',
    viewBox: `0 0 ${scene.options.width} ${scene.options.height}`,
    'aria-hidden': 'true',
  }) as SVGSVGElement;
  const defs = svgElement('defs', {});
  const marker = svgElement('marker', {
    id: `${uid}-arrow`,
    viewBox: '0 0 10 10',
    refX: 8.2,
    refY: 5,
    markerWidth: 7,
    markerHeight: 7,
    orient: 'auto-start-reverse',
  });
  marker.append(svgElement('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'diagram-arrow-head' }));
  defs.append(marker);
  svg.append(defs);

  const content = document.createElement('div');
  content.className = 'diagram-content';
  const nodes = scene.items.map((item) => {
    const node = document.createElement('div');
    const isCenter = scene.options.layout === 'radial' && item.id === scene.options.center;
    if (scene.options.layout === 'ring') {
      node.className = `diagram-vertex${levelClass(item.level)}`;
      node.dataset.diagramItem = item.id;
      if (item.badge) node.innerHTML = `<span class="diagram-badge">${esc(item.badge)}</span>`;
    } else {
      node.className = `diagram-card${levelClass(item.level)}${isCenter ? ' is-center' : ''}`;
      node.dataset.diagramItem = item.id;
      const title = document.createElement('div');
      title.className = 'diagram-card-title';
      title.textContent = item.title;
      node.append(title);
      if (item.markdown) {
        const body = document.createElement('div');
        body.className = 'diagram-card-body';
        if (context.renderMarkdown) body.innerHTML = context.renderMarkdown(item.markdown);
        else body.textContent = item.markdown;
        node.append(body);
      }
    }
    content.append(node);
    return node;
  });
  const labels = scene.items.map((item) => {
    if (scene.options.layout !== 'ring') return null;
    const label = document.createElement('div');
    label.className = 'diagram-label';
    label.dataset.diagramLabel = item.id;
    const title = document.createElement('div');
    title.className = 'diagram-label-title';
    title.textContent = item.title;
    label.append(title);
    if (item.markdown) {
      const note = document.createElement('div');
      note.className = 'diagram-label-note';
      if (context.renderMarkdown) note.innerHTML = context.renderMarkdown(item.markdown);
      else note.textContent = item.markdown;
      label.append(note);
    }
    content.append(label);
    return label;
  });
  element.replaceChildren(svg, content);

  let disposed = false;
  const draw = () => {
    if (disposed) return;
    const ratio = element.clientWidth ? scene.options.width / element.clientWidth : 1;
    labels.forEach((label) => {
      if (label) label.style.maxWidth = `${(200 / scene.options.width) * 100}%`;
    });
    const measuredLabels = labels.map((label, i) => {
      if (!label) return estimateLabelSize(scene.items[i]);
      const width = Math.min(200, label.scrollWidth * ratio);
      const height = label.scrollHeight * ratio;
      return width > 1 ? { width, height } : estimateLabelSize(scene.items[i]);
    });
    const measuredCards = nodes.map((node, i) => {
      const width = node.scrollWidth * ratio;
      const height = node.scrollHeight * ratio;
      return width > 1
        ? { width, height }
        : estimateCardSize(scene.items[i], scene.items[i].id === scene.options.center);
    });
    const layout = layoutDiagram(scene, { labels: measuredLabels, cards: measuredCards });
    const byId = new Map(layout.items.map((item) => [item.id, item]));
    nodes.forEach((node, i) => {
      const box = byId.get(scene.items[i].id)!;
      applyBox(node, box, layout.width, layout.height);
      if (box.kind === 'card') node.style.height = 'auto';
    });
    labels.forEach((label, i) => {
      const box = byId.get(scene.items[i].id)?.label;
      if (!label || !box) return;
      applyBox(label, box, layout.width, layout.height);
    });
    svg.querySelector('.diagram-edge-layer')?.remove();
    const layer = svgElement('g', { class: 'diagram-edge-layer' });
    for (const link of layout.links) {
      const attrs: Record<string, string | number> = {
        d: link.path,
        class: `diagram-edge diagram-edge-${link.kind}`,
      };
      if (link.kind === 'forward' || link.kind === 'both')
        attrs['marker-end'] = `url(#${uid}-arrow)`;
      if (link.kind === 'both') attrs['marker-start'] = `url(#${uid}-arrow)`;
      layer.append(svgElement('path', attrs));
      if (link.label)
        layer.append(
          svgElement(
            'text',
            {
              x: link.labelAt.x,
              y: link.labelAt.y,
              class: 'diagram-edge-label',
              'text-anchor': 'middle',
            },
            link.label,
          ),
        );
    }
    svg.append(layer);
  };
  draw();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw);
  observer?.observe(element);
  nodes.forEach((node) => observer?.observe(node));
  labels.forEach((label) => label && observer?.observe(label));
  return {
    update: draw,
    dispose: () => {
      disposed = true;
      observer?.disconnect();
    },
  };
}
