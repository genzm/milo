import {
  type DiagramLink,
  type DiagramLinkKind,
  type DiagramLayoutKind,
  type DiagramItem,
  type DiagramNoteMode,
  DIAGRAM_FRAME,
  type DiagramScene,
  type DiagramOptions,
  type DiagramZone,
  type DiagramCluster,
} from './types';
import { atAttributes, choice, finite } from '../markdown/attributes.mjs';
import { parseSemanticValue, parseSemanticSpan } from './coords.ts';
import { FLOW_ROUTES } from '../flow/types.ts';

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
    route: choice(attrs.route, FLOW_ROUTES, 'auto', 'route'),
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
