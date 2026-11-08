export type FlowDirection = 'right' | 'left' | 'down' | 'up';
export type FlowRoute = 'auto' | 'curve' | 'straight' | 'elbow';
export type FlowArrows = 'none' | 'start' | 'end' | 'both';
export const FLOW_ROUTES = ['auto', 'curve', 'straight', 'elbow'] as const;

export interface FlowNode {
  id: string;
  markdown: string;
  index: number;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  dx: number;
  dy: number;
  pinned: boolean;
}

export interface FlowEdge {
  index: number;
  from: string;
  to: string;
  label: string;
  route?: FlowRoute;
  arrows?: FlowArrows;
  feedback?: boolean;
}

export interface FlowGraph {
  direction: FlowDirection;
  width: number;
  height: number;
  autoHeight: boolean;
  gap: number;
  route: FlowRoute;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface FlowSceneInput {
  options: {
    direction: FlowDirection;
    width: number;
    height: number;
    autoHeight: boolean;
    gap: number;
    route: FlowRoute;
  };
  nodes: Array<{
    id: string;
    markdown: string;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
    dx: number;
    dy: number;
    pinned: boolean;
  }>;
  edges: Array<{
    from: string;
    to: string;
    label: string;
    route?: FlowRoute;
    arrows?: FlowArrows;
  }>;
}

export interface FlowNodeMeasure {
  id: string;
  minWidth: number;
  preferredWidth: number;
  maxWidth: number;
  measuredHeight: number;
  width: number;
  height: number;
}

export interface FlowFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FlowEdgePath {
  index: number;
  from: string;
  to: string;
  path: string;
  label: { x: number; y: number };
  arrows?: FlowArrows;
  role?: 'edge' | 'stem' | 'bus' | 'stub';
}

export type FlowDiagnosticCode =
  | 'NODE_OVERLAP'
  | 'TEXT_OVERFLOW'
  | 'FRAME_OVERFLOW'
  | 'EDGE_COLLISION'
  | 'EDGE_LABEL_COLLISION'
  | 'CYCLE_DETECTED'
  | 'INSUFFICIENT_SPACE';

export interface FlowDiagnostic {
  code: FlowDiagnosticCode;
  severity: 'warning' | 'error';
  nodeIds: string[];
  message: string;
}

export interface FlowRanked {
  rank: number[];
  groups: number[][];
  feedback: Set<string>;
}

export interface FlowLayoutResult {
  width: number;
  height: number;
  nodeFrames: Map<string, FlowFrame>;
  edgePaths: FlowEdgePath[];
  diagnostics: FlowDiagnostic[];
}

export const FLOW = {
  MIN_WIDTH: 180,
  PREFERRED_WIDTH: 220,
  VERTICAL_WIDTH: 250,
  MAX_WIDTH: 360,
  WIDTH_CANDIDATES: [180, 200, 220, 260, 300],
  WIDTH_VARIANCE: 80,
  HEIGHT_VARIANCE: 80,
  BOX_HEIGHT_VARIANCE: 120,
  MIN_GAP: 24,
  PREFERRED_GAP: 48,
  RANK_GAP: 88,
  PADDING: 28,
  TITLE_PX: 24,
  BODY_PX: 18,
  LABEL_PX: 14,
  MIN_HEIGHT: 160,
  HEIGHT_PAD: 48,
  FEEDBACK_PAD: 56,
  TRUNK_MIN: 28,
  TRUNK_MAX: 40,
};

export const FLOW_DIAGNOSTIC_MESSAGE: Record<FlowDiagnosticCode, string> = {
  NODE_OVERLAP: 'ノードが重なっています',
  TEXT_OVERFLOW: '文字が切れています',
  FRAME_OVERFLOW: '図が領域に収まりません',
  EDGE_COLLISION: '線がノードを横切っています',
  EDGE_LABEL_COLLISION: '線のラベルが重なっています',
  CYCLE_DETECTED: '循環があるため戻り線で示します',
  INSUFFICIENT_SPACE: '配置できる余白が足りません',
};

export function edgeKey(from: string, to: string, index?: number) {
  return index === undefined ? `${from}->${to}` : `${from}->${to}#${index}`;
}

export function diagnostic(
  code: FlowDiagnosticCode,
  nodeIds: string[] = [],
  severity: FlowDiagnostic['severity'] = 'warning',
): FlowDiagnostic {
  return { code, severity, nodeIds, message: FLOW_DIAGNOSTIC_MESSAGE[code] };
}
