import { type CanvasRoute } from '../canvas';
import { type RadialOverflowReason } from './layout-radial.ts';

export type DiagramLayoutKind = 'ring' | 'flow' | 'radial' | 'field';

export const DIAGRAM_FRAME: Record<DiagramLayoutKind, { width: number; height: number }> = {
  ring: { width: 1000, height: 500 },
  flow: { width: 1280, height: 560 },
  radial: { width: 1040, height: 580 },
  field: { width: 1280, height: 580 },
};

// Squarer than the full-slide landscape frames, so a ring or radial in a
// grid / column uses the panel instead of shrinking to the short side.
export const NESTED_DIAGRAM_FRAME = { width: 640, height: 512 };

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
  gap: number;
  nodeWidth?: number;
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

export interface Vec {
  x: number;
  y: number;
}
