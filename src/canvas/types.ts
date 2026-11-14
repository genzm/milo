import { type FlowArrows, type FlowDirection, type FlowRoute } from '../flow/types.ts';

export type CanvasDirection = FlowDirection;
export type CanvasLayout = 'flow' | 'free';
export type CanvasRoute = FlowRoute;
export type CanvasArrows = FlowArrows;
export type CanvasShape = 'card' | 'ellipse' | 'diamond';
export type CanvasFill = 'solid' | 'none';

export interface CanvasOptions {
  layout: CanvasLayout;
  direction: CanvasDirection;
  width: number;
  height: number;
  autoHeight: boolean;
  gap: number;
  route: CanvasRoute;
}

export interface CanvasNode {
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

export interface CanvasEdge {
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
