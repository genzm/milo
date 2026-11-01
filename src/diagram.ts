import { esc, type RenderContext } from './directives';
import {
  atAttributes,
  choice,
  connection,
  finite,
  mountCanvasScene,
  type CanvasArrows,
  type CanvasRoute,
  type CanvasScene,
} from './canvas';
import { parseSemanticSpan, parseSemanticValue } from './diagram/coords.ts';
import { perimeterLink } from './diagram/geometry.ts';
import { estimateFieldLabel } from './diagram/labels.ts';
import { layoutField } from './diagram/layout-field.ts';
import {
  layoutRadialSpatial,
  usesSpatialRadial,
  type RadialOverflowReason,
} from './diagram/layout-radial.ts';
import { regionRect, spatialSignature } from './diagram/render-spatial.ts';

export type DiagramLayoutKind = 'ring' | 'flow' | 'radial' | 'field';
export { usesSpatialRadial };

export const DIAGRAM_FRAME: Record<DiagramLayoutKind, { width: number; height: number }> = {
  ring: { width: 1000, height: 500 },
  flow: { width: 1280, height: 560 },
  radial: { width: 1040, height: 580 },
  field: { width: 1280, height: 580 },
};
export type DiagramLevel = 'none' | 'high' | 'medium' | 'low';
export type DiagramLinkKind = 'undirected' | 'forward' | 'both';
export type DiagramStart = 'top' | 'right' | 'bottom' | 'left';
export type DiagramOrder = 'ccw' | 'cw';
export type DiagramConnect = 'none' | 'cycle';
export type DiagramGeometry = 'regular';
export type DiagramNoteMode = 'inline' | 'outside' | 'none';
export type DiagramNoteStyle = 'plain' | 'caption';
export type DiagramNoteLinkKind = 'none' | 'leader' | 'arrow';
export type DiagramNoteSide = 'auto' | 'top' | 'right' | 'bottom' | 'left';
export type DiagramDistance = 'near' | 'mid' | 'far';
export type DiagramGuide = 'none' | 'axes';
export type DiagramClusterRegion = 'none' | 'halo';
export type DiagramClusterTone = 'accent' | 'muted' | 'ink' | 'soft';
export type DiagramShape = 'vertex' | 'card' | 'dot';

export interface DiagramItem {
  id: string;
  title: string;
  badge: string;
  level: DiagramLevel;
  shape: DiagramShape;
  markdown: string;
  noteMode?: DiagramNoteMode;
  noteSide: DiagramNoteSide;
  side: DiagramNoteSide;
  distance?: DiagramDistance;
  x?: number;
  y?: number;
  cluster: string;
}

export interface DiagramZone {
  id: string;
  label: string;
  x: { min: number; max: number };
  y: { min: number; max: number };
}

export interface DiagramCluster {
  id: string;
  title: string;
  tone: DiagramClusterTone;
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
  route: CanvasRoute;
  center: string;
  width: number;
  height: number;
  autoHeight: boolean;
  geometry: DiagramGeometry;
  noteMode: DiagramNoteMode;
  noteStyle: DiagramNoteStyle;
  noteLink: DiagramNoteLinkKind;
  guide: DiagramGuide;
  xLow: string;
  xHigh: string;
  yLow: string;
  yHigh: string;
  clusterRegion: DiagramClusterRegion;
}

export interface DiagramScene {
  options: DiagramOptions;
  items: DiagramItem[];
  links: DiagramLink[];
  zones: DiagramZone[];
  clusters: DiagramCluster[];
}

export interface DiagramBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiagramPlacedItem extends DiagramBox {
  id: string;
  kind: 'vertex' | 'card' | 'dot';
  label?: DiagramBox;
  note?: DiagramBox;
}

export interface DiagramRegion {
  id: string;
  kind: 'zone' | 'cluster';
  label: string;
  tone: string;
  box: DiagramBox;
  labelBox?: DiagramBox;
  path?: string;
  marks?: { x: number; y: number; r: number }[];
}

export interface DiagramGuideMark {
  kind: 'axis' | 'label';
  path?: string;
  text?: string;
  x?: number;
  y?: number;
  anchor?: 'start' | 'middle' | 'end';
}

export interface DiagramLegendItem {
  id: string;
  title: string;
  tone: string;
}

export interface DiagramPlacedLink {
  from: string;
  to: string;
  kind: DiagramLinkKind;
  label: string;
  path: string;
  labelAt: { x: number; y: number };
}

export interface DiagramNoteLink {
  itemId: string;
  path: string;
  kind: 'leader' | 'arrow';
}

export interface DiagramLayout {
  width: number;
  height: number;
  items: DiagramPlacedItem[];
  links: DiagramPlacedLink[];
  noteLinks: DiagramNoteLink[];
  overflow: boolean;
  overflowReason?: RadialOverflowReason;
  fitScale?: number;
  regions: DiagramRegion[];
  guides: DiagramGuideMark[];
  legend: DiagramLegendItem[];
}

const NS = 'http://www.w3.org/2000/svg';
const VERTEX = 92;
export const VERTEX_R = VERTEX / 2;
const LABEL_GAP = 18;
const NOTE_GAP = 22;
const NOTE_STACK = 6;
const NOTE_MAX = 260;
const NOTE_FONT = 18;
const TITLE_FONT = 27;
const PAD = 28;
let diagramSequence = 0;

interface Vec {
  x: number;
  y: number;
}

const NOTE_SIDE_VECTOR: Record<Exclude<DiagramNoteSide, 'auto'>, Vec> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

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

function boxCenter(box: DiagramBox): Vec {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function normalize(x: number, y: number): Vec {
  const dist = Math.hypot(x, y) || 1;
  return { x: x / dist, y: y / dist };
}

function shiftBox(box: DiagramBox | undefined, dx: number, dy: number) {
  if (!box) return;
  box.x += dx;
  box.y += dy;
}

function unionBox(a?: DiagramBox, b?: DiagramBox): DiagramBox | undefined {
  if (!a) return b ? { ...b } : undefined;
  if (!b) return { ...a };
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

function annotationBox(item: DiagramPlacedItem): DiagramBox | undefined {
  return unionBox(item.label, item.note);
}

function shiftAnnotation(item: DiagramPlacedItem, dx: number, dy: number) {
  shiftBox(item.label, dx, dy);
  shiftBox(item.note, dx, dy);
}

function boxLeavesFrame(box: DiagramBox, width: number, height: number, gap = 0) {
  return (
    box.x < PAD - gap ||
    box.y < PAD - gap ||
    box.x + box.width > width - PAD + gap ||
    box.y + box.height > height - PAD + gap
  );
}

function closestPointOnBox(box: DiagramBox, point: Vec): Vec {
  const left = box.x,
    right = box.x + box.width,
    top = box.y,
    bottom = box.y + box.height;
  if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) {
    const candidates = [
      { x: left, y: point.y, d: point.x - left },
      { x: right, y: point.y, d: right - point.x },
      { x: point.x, y: top, d: point.y - top },
      { x: point.x, y: bottom, d: bottom - point.y },
    ];
    candidates.sort((a, b) => a.d - b.d);
    return { x: candidates[0].x, y: candidates[0].y };
  }
  return {
    x: Math.min(Math.max(point.x, left), right),
    y: Math.min(Math.max(point.y, top), bottom),
  };
}

function segmentHitsBox(a: Vec, b: Vec, box: DiagramBox, pad = 8) {
  const minX = box.x - pad,
    maxX = box.x + box.width + pad,
    minY = box.y - pad,
    maxY = box.y + box.height + pad;
  let t0 = 0,
    t1 = 1;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return (
    clip(-dx, a.x - minX) && clip(dx, maxX - a.x) && clip(-dy, a.y - minY) && clip(dy, maxY - a.y)
  );
}

function cjkUnits(text: string) {
  let units = 0;
  for (const ch of text) units += /[\u3000-\u9fff]/.test(ch) ? 1 : 0.55;
  return units;
}

function estimateWrapped(text: string, font: number, maxWidth: number, lineHeight: number) {
  const units = cjkUnits(text);
  const width = Math.min(maxWidth, Math.max(48, units * font + 8));
  const lines = Math.max(1, Math.ceil((units * font) / Math.max(32, width)));
  return { width, height: lines * font * lineHeight };
}

export function estimateTitleSize(title: string, maxWidth = NOTE_MAX) {
  return estimateWrapped(title.trim() || ' ', TITLE_FONT, maxWidth, 1.35);
}

export function estimateNoteSize(markdown: string, maxWidth = NOTE_MAX) {
  const plain = markdown.trim().replace(/[#*_`[\]]/g, '');
  if (!plain) return { width: 0, height: 0 };
  return estimateWrapped(plain, NOTE_FONT, maxWidth, 1.45);
}

function resolvedNoteMode(item: DiagramItem, options: DiagramOptions): DiagramNoteMode {
  return item.noteMode ?? options.noteMode;
}

function outwardUnit(point: Vec, origin: Vec, side: DiagramNoteSide): Vec {
  if (side !== 'auto') return NOTE_SIDE_VECTOR[side];
  const x = point.x - origin.x,
    y = point.y - origin.y;
  if (Math.hypot(x, y) < 1e-6) return { x: 0, y: -1 };
  return normalize(x, y);
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
  const title = estimateTitleSize(item.title, 260);
  const extra = item.markdown.trim() ? Math.min(64, 22 + item.markdown.trim().length * 0.4) : 0;
  return { width: Math.max(96, title.width), height: title.height + extra };
}

export function estimateCardSize(item: DiagramItem, center: boolean) {
  const font = center ? 32 : 27;
  let units = 0;
  for (const ch of item.title) units += /[\u3000-\u9fff]/.test(ch) ? 1 : 0.55;
  return {
    width: Math.max(center ? 280 : 168, units * font + (center ? 80 : 64)),
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
    ['vertex', 'card', 'dot'] as const,
    layout === 'ring' ? 'vertex' : layout === 'field' ? 'dot' : 'card',
    'shape',
  );
  const x =
    attrs.x !== undefined && attrs.x !== '' ? parseSemanticValue(attrs.x, 'x', 'x') : undefined;
  const y =
    attrs.y !== undefined && attrs.y !== '' ? parseSemanticValue(attrs.y, 'y', 'y') : undefined;
  if (layout === 'field' && (x === undefined || y === undefined))
    throw new Error(`@item ${attrs.id || index + 1} には x と y が必要です。`);
  return {
    id: attrs.id,
    title,
    badge: attrs.badge !== undefined ? attrs.badge : layout === 'ring' ? String(index + 1) : '',
    level: attrs.level
      ? choice(attrs.level, ['high', 'medium', 'low'] as const, 'high', 'level')
      : 'none',
    shape,
    markdown: markdown.trim(),
    noteMode:
      attrs.note !== undefined && attrs.note !== ''
        ? choice(attrs.note, ['inline', 'outside', 'none'] as const, 'inline', 'note')
        : undefined,
    noteSide: choice(
      attrs.noteSide || attrs['note-side'],
      ['auto', 'top', 'right', 'bottom', 'left'] as const,
      'auto',
      'note-side',
    ),
    side: choice(attrs.side, ['auto', 'top', 'right', 'bottom', 'left'] as const, 'auto', 'side'),
    distance:
      attrs.distance !== undefined && attrs.distance !== ''
        ? choice(attrs.distance, ['near', 'mid', 'far'] as const, 'mid', 'distance')
        : undefined,
    x,
    y,
    cluster: attrs.cluster || '',
  };
}

/** Parse @diagram contents into items, links and layout options. */
function parseDiagramHeight(
  attrs: Record<string, string>,
  layout: DiagramLayoutKind,
  noteMode: DiagramNoteMode,
) {
  if (attrs.height === 'auto' && layout !== 'flow') {
    throw new Error('height=auto は layout=flow で使ってください。');
  }
  const autoHeight = layout === 'flow' && (attrs.height === undefined || attrs.height === 'auto');
  return {
    autoHeight,
    height: autoHeight
      ? DIAGRAM_FRAME.flow.height
      : finite(
          attrs.height,
          noteMode === 'outside'
            ? Math.max(DIAGRAM_FRAME[layout].height, 620)
            : DIAGRAM_FRAME[layout].height,
        )!,
  };
}

export function parseDiagram(source: string, rawOptions = ''): DiagramScene {
  const attrs = atAttributes(rawOptions);
  if (attrs.layout === 'tree' || attrs.layout === 'free')
    throw new Error(
      'layout は ring / flow / radial / field です。精密な配置は @canvas を使ってください。',
    );
  const layout = choice(
    attrs.layout,
    ['ring', 'flow', 'radial', 'field'] as const,
    'ring',
    'layout',
  );
  const noteMode = choice(attrs.note, ['inline', 'outside', 'none'] as const, 'inline', 'note');
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
    route: choice(attrs.route, ['curve', 'straight', 'elbow'] as const, 'curve', 'route'),
    center: attrs.center || '',
    width: finite(attrs.width, DIAGRAM_FRAME[layout].width)!,
    ...parseDiagramHeight(attrs, layout, noteMode),
    geometry: choice(attrs.geometry, ['regular'] as const, 'regular', 'geometry'),
    noteMode,
    noteStyle: choice(
      attrs.noteStyle || attrs['note-style'],
      ['plain', 'caption'] as const,
      'plain',
      'note-style',
    ),
    noteLink: choice(
      attrs.noteLink || attrs['note-link'],
      ['none', 'leader', 'arrow'] as const,
      noteMode === 'outside' ? 'arrow' : 'none',
      'note-link',
    ),
    guide: choice(attrs.guide, ['none', 'axes'] as const, 'none', 'guide'),
    xLow: attrs.xLow || attrs['x-low'] || '',
    xHigh: attrs.xHigh || attrs['x-high'] || '',
    yLow: attrs.yLow || attrs['y-low'] || '',
    yHigh: attrs.yHigh || attrs['y-high'] || '',
    clusterRegion: choice(
      attrs.clusterRegion || attrs['cluster-region'],
      ['none', 'halo'] as const,
      'none',
      'cluster-region',
    ),
  };
  if (options.width <= 0 || options.height <= 0)
    throw new Error('diagram の width / height を確認してください。');

  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const items: DiagramItem[] = [];
  const links: DiagramLink[] = [];
  const zones: DiagramZone[] = [];
  const clusters: DiagramCluster[] = [];
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
    const zone = /^@zone\s+([A-Za-z][\w-]*)(?:\s+([\s\S]*))?\s*$/.exec(text);
    if (zone) {
      flush();
      const zoneAttrs: Record<string, string> = { ...atAttributes(zone[2] || ''), id: zone[1] };
      zones.push({
        id: zoneAttrs.id,
        label: zoneAttrs.label || zoneAttrs.title || zoneAttrs.id,
        x: parseSemanticSpan(zoneAttrs.x, 'x', `zone ${zoneAttrs.id} の x`),
        y: parseSemanticSpan(zoneAttrs.y, 'y', `zone ${zoneAttrs.id} の y`),
      });
      continue;
    }
    const cluster = /^@cluster\s+([A-Za-z][\w-]*)(?:\s+([\s\S]*))?\s*$/.exec(text);
    if (cluster) {
      flush();
      const clusterAttrs: Record<string, string> = {
        ...atAttributes(cluster[2] || ''),
        id: cluster[1],
      };
      clusters.push({
        id: clusterAttrs.id,
        title: clusterAttrs.title || clusterAttrs.label || clusterAttrs.id,
        tone: choice(
          clusterAttrs.tone,
          ['accent', 'muted', 'ink', 'soft'] as const,
          'muted',
          'tone',
        ),
      });
      continue;
    }
    if (!text) {
      current?.body.push(line);
      continue;
    }
    if (text.startsWith('@')) throw new Error(`diagram の中では使えません: ${text}`);
    if (!current)
      throw new Error('diagram の内容は @item / @link / @zone / @cluster で書いてください。');
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
  return { options, items, links, zones, clusters };
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

function ringCenters(scene: DiagramScene, radius: number) {
  const { width, height, start, order } = scene.options;
  const n = scene.items.length;
  const cx = width / 2;
  const cy = height / 2;
  return scene.items.map((item, i) => {
    const phi = n === 1 ? 0 : angle(i, n, start, order);
    const center = n === 1 ? { x: cx, y: cy } : pointOnRing(cx, cy, radius, phi);
    return { item, i, phi, center };
  });
}

function vertexItem(
  item: DiagramItem,
  center: Vec,
  extras: { label?: DiagramBox; note?: DiagramBox } = {},
): DiagramPlacedItem {
  return {
    id: item.id,
    kind: 'vertex',
    x: center.x - VERTEX_R,
    y: center.y - VERTEX_R,
    width: VERTEX,
    height: VERTEX,
    ...extras,
  };
}

function stackedOutside(
  origin: Vec,
  unit: Vec,
  title: { width: number; height: number },
  body: { width: number; height: number },
): { label: DiagramBox; note?: DiagramBox } {
  const hasBody = body.width > 0 && body.height > 0;
  const groupW = Math.max(title.width, hasBody ? body.width : 0, 1);
  const groupH = title.height + (hasBody ? NOTE_STACK + body.height : 0);
  const half = (Math.abs(unit.x) * groupW + Math.abs(unit.y) * groupH) / 2;
  const dist = VERTEX_R + NOTE_GAP + half;
  const x = origin.x + unit.x * dist - groupW / 2;
  const y = origin.y + unit.y * dist - groupH / 2;
  const label = {
    x: x + (groupW - title.width) / 2,
    y,
    width: title.width,
    height: title.height,
  };
  const note = hasBody
    ? {
        x: x + (groupW - body.width) / 2,
        y: y + title.height + NOTE_STACK,
        width: body.width,
        height: body.height,
      }
    : undefined;
  return { label, note };
}

function noteLinkPath(vertex: DiagramPlacedItem, annotation: DiagramBox): string | null {
  const startCenter = boxCenter(vertex);
  const target = closestPointOnBox(annotation, startCenter);
  const unit = normalize(target.x - startCenter.x, target.y - startCenter.y);
  const start = {
    x: startCenter.x + unit.x * VERTEX_R,
    y: startCenter.y + unit.y * VERTEX_R,
  };
  const end = closestPointOnBox(annotation, start);
  const dx = end.x - start.x,
    dy = end.y - start.y,
    dist = Math.hypot(dx, dy);
  if (dist < 8) return null;
  const inset = Math.min(10, dist * 0.18);
  return `M ${start.x} ${start.y} L ${end.x - (dx / dist) * inset} ${end.y - (dy / dist) * inset}`;
}

function layoutRing(
  scene: DiagramScene,
  measured: {
    labels?: { width: number; height: number }[];
    notes?: { width: number; height: number }[];
  } = {},
): { items: DiagramPlacedItem[]; radius: number; noteLinks: DiagramNoteLink[]; overflow: boolean } {
  const { width, height, start, order, noteLink } = scene.options;
  const n = scene.items.length;
  const cx = width / 2;
  const cy = height / 2;
  const origin = { x: cx, y: cy };
  const minRadius = n < 2 ? 0 : VERTEX / (2 * Math.sin(Math.PI / n)) + 18;
  const modes = scene.items.map((item) => resolvedNoteMode(item, scene.options));
  const hasOutside = modes.some((mode) => mode === 'outside');

  if (!hasOutside) {
    const sizes = scene.items.map((item, i) => {
      const raw = measured.labels?.[i] || estimateLabelSize(item);
      return { width: Math.min(200, raw.width), height: raw.height };
    });
    const maxLabel = Math.max(40, ...sizes.map((size) => size.height));
    const maxRadius = Math.min(width, height) / 2 - VERTEX_R - PAD - maxLabel;
    const radius = Math.max(minRadius, Math.min(Math.max(120, maxRadius), maxRadius));
    const items = ringCenters(scene, radius).map(({ item, phi, center }, i) =>
      vertexItem(
        item,
        center,
        modes[i] === 'none'
          ? {}
          : { label: labelOutside({ cx: center.x, cy: center.y, phi }, sizes[i]) },
      ),
    );
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
    return { items, radius, noteLinks: [], overflow: false };
  }

  const measuredFromDom = Boolean(measured.labels || measured.notes);
  let maxWidth = NOTE_MAX;
  let radius = minRadius;
  let items: DiagramPlacedItem[] = [];
  let overflow = false;

  for (let attempt = 0; attempt < 8; attempt++) {
    const titles = scene.items.map((item, i) => {
      const raw = measured.labels?.[i] || estimateTitleSize(item.title, maxWidth);
      return { width: Math.min(maxWidth, Math.max(48, raw.width)), height: raw.height };
    });
    const bodies = scene.items.map((item, i) => {
      if (modes[i] !== 'outside') return { width: 0, height: 0 };
      const raw = measured.notes?.[i] || estimateNoteSize(item.markdown, maxWidth);
      return { width: Math.min(maxWidth, raw.width), height: raw.height };
    });
    const groups = titles.map((title, i) => {
      const body = bodies[i];
      const hasBody = modes[i] === 'outside' && body.width > 0 && body.height > 0;
      return {
        width: Math.max(title.width, hasBody ? body.width : 0, 1),
        height: title.height + (hasBody ? NOTE_STACK + body.height : 0),
      };
    });
    let extent = 40;
    ringCenters(scene, 1).forEach(({ phi }, i) => {
      if (modes[i] === 'none') return;
      const dx = Math.sin(phi),
        dy = -Math.cos(phi);
      extent = Math.max(
        extent,
        NOTE_GAP + Math.abs(dx) * groups[i].width + Math.abs(dy) * groups[i].height,
      );
    });
    const maxRadius = Math.min(width, height) / 2 - VERTEX_R - PAD - extent;
    if (attempt === 0) radius = Math.max(minRadius, maxRadius);
    items = ringCenters(scene, radius).map(({ item, i, phi, center }) => {
      const mode = modes[i];
      if (mode === 'none') return vertexItem(item, center);
      if (mode === 'inline') {
        return vertexItem(item, center, {
          label: labelOutside({ cx: center.x, cy: center.y, phi }, titles[i]),
        });
      }
      const unit = outwardUnit(center, origin, item.noteSide);
      return vertexItem(item, center, stackedOutside(center, unit, titles[i], bodies[i]));
    });

    const units = items.map((placed, i) =>
      outwardUnit(boxCenter(placed), origin, scene.items[i].noteSide),
    );
    for (let iter = 0; iter < 8; iter++) {
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = annotationBox(items[i]),
            b = annotationBox(items[j]);
          if (!a || !b || !overlaps(a, b, 10)) continue;
          shiftAnnotation(items[i], units[i].x * 8, units[i].y * 8);
          shiftAnnotation(items[j], units[j].x * 8, units[j].y * 8);
        }
      }
    }
    for (let iter = 0; iter < 6; iter++) {
      for (let i = 0; i < items.length; i++) {
        const box = annotationBox(items[i]);
        if (!box) continue;
        for (let j = 0; j < items.length; j++) {
          if (i === j) continue;
          const other = annotationBox(items[j]);
          const hitsVertex = overlaps(box, items[j], 6);
          const hitsNote = other ? overlaps(box, other, 10) : false;
          if (!hitsVertex && !hitsNote) continue;
          const tangent = { x: -units[i].y, y: units[i].x };
          const away = boxCenter(box);
          const from = hitsNote && other ? boxCenter(other) : boxCenter(items[j]);
          if ((away.x - from.x) * tangent.x + (away.y - from.y) * tangent.y < 0) {
            tangent.x *= -1;
            tangent.y *= -1;
          }
          shiftAnnotation(items[i], tangent.x * 6, tangent.y * 6);
        }
      }
    }
    const chords = resolvedLinks(scene)
      .map((link) => {
        const from = items.find((item) => item.id === link.from);
        const to = items.find((item) => item.id === link.to);
        return from && to ? { from, to } : null;
      })
      .filter((pair): pair is { from: DiagramPlacedItem; to: DiagramPlacedItem } => pair !== null);
    for (let i = 0; i < items.length; i++) {
      const box = annotationBox(items[i]);
      if (!box) continue;
      for (const chord of chords) {
        if (chord.from.id === items[i].id || chord.to.id === items[i].id) continue;
        if (!segmentHitsBox(boxCenter(chord.from), boxCenter(chord.to), box, 6)) continue;
        shiftAnnotation(items[i], units[i].x * 10, units[i].y * 10);
      }
    }

    overflow = items.some((item, i) => {
      const box = annotationBox(item);
      if (!box) return boxLeavesFrame(item, width, height, 0);
      if (boxLeavesFrame(box, width, height, 12)) return true;
      return items.some((other, j) => {
        if (i >= j) return false;
        const otherBox = annotationBox(other);
        return otherBox ? overlaps(box, otherBox, 4) : false;
      });
    });
    if (!overflow) break;
    if (radius > minRadius + 0.5) {
      radius = Math.max(minRadius, radius * 0.9);
      continue;
    }
    if (!measuredFromDom && maxWidth > 160) {
      maxWidth = Math.max(160, maxWidth * 0.82);
      continue;
    }
    break;
  }

  for (const item of items) {
    if (item.label) clampBox(item.label, width, height);
    if (item.note) clampBox(item.note, width, height);
  }

  const noteLinks: DiagramNoteLink[] = [];
  if (noteLink !== 'none') {
    const kind = noteLink === 'leader' ? 'leader' : 'arrow';
    for (let i = 0; i < items.length; i++) {
      if (modes[i] !== 'outside') continue;
      const box = annotationBox(items[i]);
      if (!box) continue;
      const path = noteLinkPath(items[i], box);
      if (path) noteLinks.push({ itemId: items[i].id, path, kind });
    }
  }
  return { items, radius, noteLinks, overflow };
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
  const sizeAt = (index: number, hub: boolean) => {
    const raw = cardSizes[index] || estimateCardSize(scene.items[index], hub);
    return { width: raw.width, height: raw.height };
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

  const hub = placeHub();
  const { minR, maxR } = metrics(hub);
  const radius =
    Number.isFinite(maxR) && maxR > minR ? Math.min(maxR, Math.max(minR, minR + 36)) : minR;
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
  perimeter = false,
): { path: string; labelAt: { x: number; y: number } } {
  if (perimeter || from.kind === 'dot' || to.kind === 'dot') {
    const geometry = perimeterLink(from, to, {
      from: from.kind === 'dot' || from.kind === 'vertex' ? 'circle' : 'box',
      to: to.kind === 'dot' || to.kind === 'vertex' ? 'circle' : 'box',
    });
    return geometry || { path: '', labelAt: { x: 0, y: 0 } };
  }
  if (from.kind === 'vertex' && to.kind === 'vertex') return circlePath(from, to);
  const geometry = connection(from, to, 'straight');
  return { path: geometry.path, labelAt: geometry.label };
}

function emptySpatial() {
  return {
    regions: [] as DiagramRegion[],
    guides: [] as DiagramGuideMark[],
    legend: [] as DiagramLegendItem[],
  };
}

/** Deterministic placement for ring and radial diagrams. Flow uses the canvas engine. */
export function layoutDiagram(
  scene: DiagramScene,
  measured: {
    labels?: { width: number; height: number }[];
    notes?: { width: number; height: number }[];
    cards?: { width: number; height: number }[];
  } = {},
): DiagramLayout {
  const { options } = scene;
  if (options.layout === 'field') {
    const field = layoutField(
      {
        options: {
          width: options.width,
          height: options.height,
          guide: options.guide,
          xLow: options.xLow,
          xHigh: options.xHigh,
          yLow: options.yLow,
          yHigh: options.yHigh,
          clusterRegion: options.clusterRegion,
        },
        items: scene.items.map((item) => ({
          id: item.id,
          title: item.title,
          shape: item.shape,
          x: item.x ?? 0,
          y: item.y ?? 0,
          cluster: item.cluster,
        })),
        links: resolvedLinks(scene),
        zones: scene.zones,
        clusters: scene.clusters,
      },
      measured.labels || scene.items.map((item) => estimateFieldLabel(item.title)),
    );
    return {
      width: options.width,
      height: options.height,
      items: field.items,
      links: field.links,
      noteLinks: field.noteLinks,
      overflow: field.overflow,
      regions: field.regions,
      guides: field.guides,
      legend: field.legend,
    };
  }
  if (options.layout === 'radial') {
    const sizes =
      measured.cards ||
      scene.items.map((item) => estimateCardSize(item, item.id === options.center));
    const spatial = usesSpatialRadial(scene);
    const radial = spatial ? layoutRadialSpatial(scene, sizes) : null;
    const items = radial ? radial.items : layoutRadial(scene, sizes);
    const overflow = radial?.overflow ?? false;
    const byId = new Map(items.map((item) => [item.id, item]));
    const links = resolvedLinks(scene)
      .map((link) => {
        const geometry = linkGeometry(byId.get(link.from)!, byId.get(link.to)!, spatial);
        return { ...link, path: geometry.path, labelAt: geometry.labelAt };
      })
      .filter((link) => link.path);
    return {
      width: options.width,
      height: options.height,
      items,
      links,
      noteLinks: [],
      overflow,
      overflowReason: radial?.overflowReason,
      fitScale: radial?.fitScale,
      ...emptySpatial(),
    };
  }
  const ring = layoutRing(scene, measured);
  const byId = new Map(ring.items.map((item) => [item.id, item]));
  const links = resolvedLinks(scene).map((link) => {
    const geometry = linkGeometry(byId.get(link.from)!, byId.get(link.to)!);
    return { ...link, path: geometry.path, labelAt: geometry.labelAt };
  });
  return {
    width: options.width,
    height: options.height,
    items: ring.items,
    links,
    noteLinks: ring.noteLinks,
    overflow: ring.overflow,
    ...emptySpatial(),
  };
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
      autoHeight: scene.options.autoHeight,
      gap: 54,
      route: scene.options.route,
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

function applyBox(
  element: HTMLElement,
  box: DiagramBox,
  width: number,
  height: number,
  mode: 'size' | 'center' | 'dot' = 'size',
) {
  if (mode === 'center' || mode === 'dot') {
    element.style.left = `${((box.x + box.width / 2) / width) * 100}%`;
    element.style.top = `${((box.y + box.height / 2) / height) * 100}%`;
    element.style.transform = 'translate(-50%, -50%)';
    if (mode === 'dot') {
      element.style.width = '';
      element.style.height = '';
      return;
    }
    element.style.width = 'max-content';
    element.style.height = 'auto';
    return;
  }
  element.style.left = `${(box.x / width) * 100}%`;
  element.style.top = `${(box.y / height) * 100}%`;
  element.style.width = `${(box.width / width) * 100}%`;
  element.style.transform = '';
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
    element.style.setProperty('--diagram-display-width', `${scene.options.width}px`);
    element.style.setProperty('--diagram-display-height', `${scene.options.height}px`);
    return mountCanvasScene(element, toCanvasScene(scene), context);
  }

  const uid = `milo-diagram-${++diagramSequence}`;
  element.className = `milo-diagram diagram-layout-${scene.options.layout}`;
  element.style.setProperty('--diagram-display-width', `${scene.options.width}px`);
  element.style.setProperty('--diagram-display-height', `${scene.options.height}px`);
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
  const noteMarker = svgElement('marker', {
    id: `${uid}-note-arrow`,
    viewBox: '0 0 10 10',
    refX: 8,
    refY: 5,
    markerWidth: 5,
    markerHeight: 5,
    orient: 'auto-start-reverse',
  });
  noteMarker.append(
    svgElement('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'diagram-note-arrow-head' }),
  );
  defs.append(marker, noteMarker);
  svg.append(defs);

  const hasOutsideNotes =
    scene.options.layout === 'ring' &&
    scene.items.some((item) => resolvedNoteMode(item, scene.options) === 'outside');
  if (hasOutsideNotes) element.classList.add('diagram-has-notes');
  if (scene.options.layout === 'field' || usesSpatialRadial(scene))
    element.classList.add('diagram-has-spatial');

  const content = document.createElement('div');
  content.className = 'diagram-content';
  const clusterTone = new Map<string, string>();
  const toneCycle = ['accent', 'muted', 'ink', 'soft'];
  let toneIndex = 0;
  for (const cluster of scene.clusters) clusterTone.set(cluster.id, cluster.tone);
  for (const item of scene.items) {
    if (!item.cluster || clusterTone.has(item.cluster)) continue;
    clusterTone.set(item.cluster, toneCycle[toneIndex++ % toneCycle.length]);
  }
  const nodes = scene.items.map((item) => {
    const node = document.createElement('div');
    const isCenter = scene.options.layout === 'radial' && item.id === scene.options.center;
    const clusterClass = item.cluster ? ` is-cluster-${clusterTone.get(item.cluster)}` : '';
    if (scene.options.layout === 'field' && item.shape !== 'card') {
      node.className = `diagram-dot${levelClass(item.level)}${clusterClass}`;
      node.dataset.diagramItem = item.id;
    } else if (scene.options.layout === 'ring') {
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
  const annotations = scene.items.map((item) => {
    if (scene.options.layout === 'field') {
      const wrap = document.createElement('div');
      wrap.className = 'diagram-label diagram-field-label';
      wrap.dataset.diagramLabel = item.id;
      const title = document.createElement('div');
      title.className = 'diagram-label-title';
      title.textContent = item.title;
      wrap.append(title);
      content.append(wrap);
      return wrap;
    }
    if (scene.options.layout !== 'ring') return null;
    const mode = resolvedNoteMode(item, scene.options);
    if (mode === 'none') return null;
    const wrap = document.createElement('div');
    if (mode === 'outside') {
      wrap.className = `diagram-note diagram-note-${scene.options.noteStyle}`;
      wrap.dataset.diagramNote = item.id;
      const title = document.createElement('div');
      title.className = 'diagram-note-title';
      title.textContent = item.title;
      wrap.append(title);
      if (item.markdown) {
        const body = document.createElement('div');
        body.className = 'diagram-note-body';
        if (context.renderMarkdown) body.innerHTML = context.renderMarkdown(item.markdown);
        else body.textContent = item.markdown;
        wrap.append(body);
      }
    } else {
      wrap.className = 'diagram-label';
      wrap.dataset.diagramLabel = item.id;
      const title = document.createElement('div');
      title.className = 'diagram-label-title';
      title.textContent = item.title;
      wrap.append(title);
      if (item.markdown) {
        const note = document.createElement('div');
        note.className = 'diagram-label-note';
        if (context.renderMarkdown) note.innerHTML = context.renderMarkdown(item.markdown);
        else note.textContent = item.markdown;
        wrap.append(note);
      }
    }
    content.append(wrap);
    return wrap;
  });
  const overflowHint = document.createElement('div');
  overflowHint.className = 'diagram-overflow-hint';
  overflowHint.hidden = true;
  overflowHint.textContent =
    scene.options.layout === 'ring' ? '注釈が領域に収まりません' : '図が領域に収まりません';
  const legend = document.createElement('div');
  legend.className = 'diagram-legend';
  legend.hidden = true;
  content.append(overflowHint, legend);
  element.replaceChildren(svg, content);

  let disposed = false;
  let lastSignature = '';
  const measurePart = (
    node: Element | null | undefined,
    fallback: { width: number; height: number },
    ratio: number,
  ) => {
    if (!node) return fallback;
    const width = (node as HTMLElement).scrollWidth * ratio;
    const height = (node as HTMLElement).scrollHeight * ratio;
    return width > 1 ? { width, height } : fallback;
  };
  const draw = () => {
    if (disposed) return;
    const ratio = element.clientWidth ? scene.options.width / element.clientWidth : 1;
    annotations.forEach((node, i) => {
      if (!node) return;
      const outside = resolvedNoteMode(scene.items[i], scene.options) === 'outside';
      const cap = scene.options.layout === 'field' ? 180 : outside ? NOTE_MAX : 200;
      const maxWidth = `${(cap / scene.options.width) * 100}%`;
      if (node.style.maxWidth !== maxWidth) node.style.maxWidth = maxWidth;
    });
    const measuredLabels = annotations.map((node, i) => {
      const item = scene.items[i];
      const mode = resolvedNoteMode(item, scene.options);
      if (mode === 'outside') {
        return measurePart(
          node?.querySelector('.diagram-note-title') || node,
          estimateTitleSize(item.title),
          ratio,
        );
      }
      if (scene.options.layout === 'field') {
        if (!node) return estimateFieldLabel(item.title);
        const width = Math.min(180, node.scrollWidth * ratio);
        const height = node.scrollHeight * ratio;
        return width > 1 ? { width, height } : estimateFieldLabel(item.title);
      }
      if (!node) return estimateLabelSize(item);
      const width = Math.min(200, node.scrollWidth * ratio);
      const height = node.scrollHeight * ratio;
      return width > 1 ? { width, height } : estimateLabelSize(item);
    });
    const measuredNotes = annotations.map((node, i) => {
      const item = scene.items[i];
      if (resolvedNoteMode(item, scene.options) !== 'outside') return { width: 0, height: 0 };
      return measurePart(
        node?.querySelector('.diagram-note-body'),
        estimateNoteSize(item.markdown),
        ratio,
      );
    });
    const measuredCards = nodes.map((node, i) => {
      const width = node.scrollWidth * ratio;
      const height = node.scrollHeight * ratio;
      return width > 1
        ? { width, height }
        : estimateCardSize(scene.items[i], scene.items[i].id === scene.options.center);
    });
    const layout = layoutDiagram(scene, {
      labels: measuredLabels,
      notes: measuredNotes,
      cards: measuredCards,
    });
    const signature = spatialSignature(layout);
    if (signature === lastSignature) return;
    lastSignature = signature;
    const byId = new Map(layout.items.map((item) => [item.id, item]));
    nodes.forEach((node, i) => {
      const box = byId.get(scene.items[i].id)!;
      applyBox(
        node,
        box,
        layout.width,
        layout.height,
        box.kind === 'card' ? 'center' : box.kind === 'dot' ? 'dot' : 'size',
      );
    });
    annotations.forEach((node, i) => {
      const placed = byId.get(scene.items[i].id);
      if (!node || !placed) return;
      const box =
        resolvedNoteMode(scene.items[i], scene.options) === 'outside' &&
        scene.options.layout === 'ring'
          ? annotationBox(placed)
          : placed.label;
      if (!box) {
        node.style.display = 'none';
        return;
      }
      node.style.display = '';
      applyBox(node, box, layout.width, layout.height);
    });
    const fit = layout.fitScale ?? 1;
    const layerScale = fit < 0.999 ? `scale(${fit})` : '';
    content.style.transform = layerScale;
    svg.style.transform = layerScale;
    content.style.transformOrigin = '50% 50%';
    svg.style.transformOrigin = '50% 50%';
    overflowHint.textContent =
      layout.overflowReason === 'read'
        ? '文字が小さくて読めません'
        : layout.overflowReason === 'overlap'
          ? '同じ方向のカードが重なっています'
          : scene.options.layout === 'ring'
            ? '注釈が領域に収まりません'
            : '図が領域に収まりません';
    overflowHint.hidden = !layout.overflow;
    element.classList.toggle('is-overflow', layout.overflow);
    if (layout.overflow) element.setAttribute('data-diagram-overflow', 'true');
    else element.removeAttribute('data-diagram-overflow');
    legend.hidden = !layout.legend.length;
    legend.replaceChildren(
      ...layout.legend.map((entry) => {
        const row = document.createElement('div');
        row.className = `diagram-legend-item is-${entry.tone}`;
        row.innerHTML = `<i></i><span>${esc(entry.title)}</span>`;
        return row;
      }),
    );
    svg.querySelector('.diagram-region-layer')?.remove();
    svg.querySelector('.diagram-guide-layer')?.remove();
    svg.querySelector('.diagram-note-layer')?.remove();
    svg.querySelector('.diagram-edge-layer')?.remove();
    const regionLayer = svgElement('g', { class: 'diagram-region-layer' });
    for (const region of layout.regions) {
      const box = regionRect(region.box);
      const klass = `diagram-region is-${region.kind} is-${region.tone}`;
      if (region.path) {
        regionLayer.append(svgElement('path', { d: region.path, class: klass }));
      } else if (region.marks?.length) {
        for (const mark of region.marks) {
          regionLayer.append(
            svgElement('circle', { cx: mark.x, cy: mark.y, r: mark.r, class: klass }),
          );
        }
      } else {
        regionLayer.append(svgElement('rect', { ...box, rx: 8, class: klass }));
      }
      if (region.label && region.kind === 'zone') {
        const label = region.labelBox;
        regionLayer.append(
          svgElement(
            'text',
            {
              x: label ? label.x : box.x + 10,
              y: label ? label.y + 16 : box.y + 18,
              class: 'diagram-region-label',
            },
            region.label,
          ),
        );
      }
    }
    const guideLayer = svgElement('g', { class: 'diagram-guide-layer' });
    for (const mark of layout.guides) {
      if (mark.path) guideLayer.append(svgElement('path', { d: mark.path, class: 'diagram-axis' }));
      if (mark.text)
        guideLayer.append(
          svgElement(
            'text',
            {
              x: mark.x || 0,
              y: mark.y || 0,
              class: 'diagram-axis-label',
              'text-anchor': mark.anchor || 'middle',
            },
            mark.text,
          ),
        );
    }
    svg.append(regionLayer, guideLayer);
    const noteLayer = svgElement('g', { class: 'diagram-note-layer' });
    for (const link of layout.noteLinks) {
      const attrs: Record<string, string | number> = {
        d: link.path,
        class: `diagram-note-link is-${link.kind}`,
      };
      if (link.kind === 'arrow') attrs['marker-end'] = `url(#${uid}-note-arrow)`;
      noteLayer.append(svgElement('path', attrs));
    }
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
    svg.append(noteLayer, layer);
  };
  draw();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw);
  observer?.observe(element);
  nodes.forEach((node) => observer?.observe(node));
  annotations.forEach((node) => node && observer?.observe(node));
  return {
    update: draw,
    dispose: () => {
      disposed = true;
      observer?.disconnect();
    },
  };
}
