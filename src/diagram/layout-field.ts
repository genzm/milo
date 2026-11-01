import { leaderPath, overlaps, perimeterLink } from './geometry.ts';
import { estimateFieldLabel, placeAnchoredLabel } from './labels.ts';
import {
  DOT,
  boxFromCenter,
  boxLeaves,
  normalize,
  plotCenter,
  semanticToDisplay,
  spatialFrame,
  type Box,
  type SemanticPoint,
  type SpatialFrame,
} from './spatial.ts';

export interface FieldItem {
  id: string;
  title: string;
  shape: 'vertex' | 'card' | 'dot';
  x: number;
  y: number;
  cluster: string;
}

export interface FieldZone {
  id: string;
  label: string;
  x: { min: number; max: number };
  y: { min: number; max: number };
}

export interface FieldCluster {
  id: string;
  title: string;
  tone: string;
}

export interface FieldScene {
  options: {
    width: number;
    height: number;
    guide: 'none' | 'axes';
    xLow: string;
    xHigh: string;
    yLow: string;
    yHigh: string;
    clusterRegion: 'none' | 'halo';
  };
  items: FieldItem[];
  links: { from: string; to: string; kind: 'undirected' | 'forward' | 'both'; label: string }[];
  zones: FieldZone[];
  clusters: FieldCluster[];
}

export interface FieldGuide {
  kind: 'axis' | 'label';
  path?: string;
  text?: string;
  x?: number;
  y?: number;
  anchor?: 'start' | 'middle' | 'end';
}

export interface FieldRegion {
  id: string;
  kind: 'zone' | 'cluster';
  label: string;
  tone: string;
  box: Box;
}

function itemSize(item: FieldItem, labels: { width: number; height: number }[], index: number) {
  if (item.shape === 'card') return labels[index] || { width: 160, height: 48 };
  if (item.shape === 'vertex') return { width: 72, height: 72 };
  return { width: DOT, height: DOT };
}

function preferredDir(semantic: SemanticPoint) {
  if (Math.hypot(semantic.x, semantic.y) < 1e-6) return { x: 0, y: -1 };
  return normalize(semantic.x, -semantic.y);
}

export function layoutField(
  scene: FieldScene,
  labelSizes: { width: number; height: number }[] = [],
) {
  const { width, height, guide, clusterRegion } = scene.options;
  const hasLegend = scene.items.some((item) => item.cluster);
  const frame: SpatialFrame = spatialFrame(width, height, {
    bottom: hasLegend ? 88 : 56,
  });
  const nodes = scene.items.map((item, i) => {
    const semantic = { x: item.x, y: item.y };
    const kind = item.shape === 'card' ? 'card' : item.shape === 'vertex' ? 'vertex' : 'dot';
    return {
      id: item.id,
      kind: kind as 'card' | 'vertex' | 'dot',
      ...boxFromCenter(semanticToDisplay(semantic, frame), itemSize(item, labelSizes, i)),
      semantic,
      cluster: item.cluster,
    };
  });

  const obstacles: Box[] = nodes.map((node) => node);
  let overflow = nodes.some((node) => boxLeaves(node, frame, 2));
  const placed = nodes.map((node, i) => {
    const size = labelSizes[i] || estimateFieldLabel(scene.items[i].title);
    const preferred = preferredDir(node.semantic);
    const result = placeAnchoredLabel(
      semanticToDisplay(node.semantic, frame),
      size,
      preferred,
      obstacles,
      frame,
    );
    obstacles.push(result.box);
    overflow = overflow || result.overflow || boxLeaves(result.box, frame, 2);
    for (const other of nodes) {
      if (other.id !== node.id && overlaps(result.box, other, 4)) overflow = true;
    }
    return { ...node, label: result.box };
  });

  const byId = new Map(placed.map((item) => [item.id, item]));
  const links = scene.links.flatMap((link) => {
    const from = byId.get(link.from);
    const to = byId.get(link.to);
    if (!from || !to) return [];
    const geometry = perimeterLink(from, to, {
      from: from.kind === 'dot' || from.kind === 'vertex' ? 'circle' : 'box',
      to: to.kind === 'dot' || to.kind === 'vertex' ? 'circle' : 'box',
    });
    if (!geometry) return [];
    return [{ ...link, path: geometry.path, labelAt: geometry.labelAt }];
  });
  const noteLinks = placed.flatMap((item) => {
    if (!item.label) return [];
    const path = leaderPath(item, item.label, item.kind !== 'card');
    return path ? [{ itemId: item.id, path, kind: 'leader' as const }] : [];
  });

  return {
    items: placed,
    links,
    noteLinks,
    overflow,
    frame,
    regions: [
      ...layoutZones(scene.zones, frame),
      ...(clusterRegion === 'halo' ? layoutClusterHalos(placed, scene.clusters) : []),
    ],
    guides: guide === 'axes' ? layoutAxes(frame, scene.options) : [],
    legend: legendFor(scene),
  };
}

export function layoutZones(zones: FieldZone[], frame: SpatialFrame): FieldRegion[] {
  return zones.map((zone) => {
    const a = semanticToDisplay({ x: zone.x.min, y: zone.y.max }, frame);
    const b = semanticToDisplay({ x: zone.x.max, y: zone.y.min }, frame);
    return {
      id: zone.id,
      kind: 'zone' as const,
      label: zone.label,
      tone: 'muted',
      box: { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y },
    };
  });
}

export function layoutClusterHalos(
  items: {
    id: string;
    cluster?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    label?: Box;
  }[],
  clusters: FieldCluster[],
): FieldRegion[] {
  const titles = new Map(clusters.map((cluster) => [cluster.id, cluster]));
  const groups = new Map<string, Box[]>();
  for (const item of items) {
    if (!item.cluster) continue;
    const boxes = groups.get(item.cluster) || [];
    boxes.push(item);
    if (item.label) boxes.push(item.label);
    groups.set(item.cluster, boxes);
  }
  return [...groups.entries()].map(([id, boxes]) => {
    const x = Math.min(...boxes.map((box) => box.x)) - 14;
    const y = Math.min(...boxes.map((box) => box.y)) - 14;
    const right = Math.max(...boxes.map((box) => box.x + box.width)) + 14;
    const bottom = Math.max(...boxes.map((box) => box.y + box.height)) + 14;
    return {
      id,
      kind: 'cluster' as const,
      label: titles.get(id)?.title || id,
      tone: titles.get(id)?.tone || 'muted',
      box: { x, y, width: right - x, height: bottom - y },
    };
  });
}

export function layoutAxes(
  frame: SpatialFrame,
  labels: { xLow: string; xHigh: string; yLow: string; yHigh: string },
): FieldGuide[] {
  const origin = plotCenter(frame);
  const left = semanticToDisplay({ x: -1, y: 0 }, frame);
  const right = semanticToDisplay({ x: 1, y: 0 }, frame);
  const top = semanticToDisplay({ x: 0, y: 1 }, frame);
  const bottom = semanticToDisplay({ x: 0, y: -1 }, frame);
  const guides: FieldGuide[] = [
    { kind: 'axis', path: `M ${left.x} ${origin.y} L ${right.x} ${origin.y}` },
    { kind: 'axis', path: `M ${origin.x} ${top.y} L ${origin.x} ${bottom.y}` },
  ];
  if (labels.xLow)
    guides.push({ kind: 'label', text: labels.xLow, x: left.x, y: origin.y - 14, anchor: 'start' });
  if (labels.xHigh)
    guides.push({ kind: 'label', text: labels.xHigh, x: right.x, y: origin.y - 14, anchor: 'end' });
  if (labels.yHigh)
    guides.push({
      kind: 'label',
      text: labels.yHigh,
      x: origin.x + 10,
      y: top.y + 16,
      anchor: 'start',
    });
  if (labels.yLow)
    guides.push({
      kind: 'label',
      text: labels.yLow,
      x: origin.x + 10,
      y: bottom.y - 4,
      anchor: 'start',
    });
  return guides;
}

function legendFor(scene: FieldScene) {
  const seen = new Map<string, { id: string; title: string; tone: string }>();
  const declared = new Map(scene.clusters.map((cluster) => [cluster.id, cluster]));
  const tones = ['accent', 'muted', 'ink', 'soft'];
  let next = 0;
  for (const item of scene.items) {
    if (!item.cluster || seen.has(item.cluster)) continue;
    const declaredCluster = declared.get(item.cluster);
    seen.set(item.cluster, {
      id: item.cluster,
      title: declaredCluster?.title || item.cluster,
      tone: declaredCluster?.tone || tones[next++ % tones.length],
    });
  }
  return [...seen.values()];
}
