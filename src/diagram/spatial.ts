export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Vec {
  x: number;
  y: number;
}

export type SpatialSide = 'auto' | 'top' | 'right' | 'bottom' | 'left';
export type SpatialDistance = 'near' | 'mid' | 'far';

export interface SpatialFrame {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface SemanticPoint {
  x: number;
  y: number;
}

export const SPATIAL_PAD = 56;
export const DOT = 12;
export const DISTANCE_RANK: Record<SpatialDistance, number> = {
  near: 0.5,
  mid: 0.72,
  far: 1,
};
export const SIDE_SEMANTIC: Record<Exclude<SpatialSide, 'auto'>, SemanticPoint> = {
  top: { x: 0, y: 1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
};

export function spatialFrame(
  width: number,
  height: number,
  extras: Partial<Pick<SpatialFrame, 'left' | 'right' | 'top' | 'bottom'>> = {},
): SpatialFrame {
  return {
    width,
    height,
    left: extras.left ?? SPATIAL_PAD,
    right: extras.right ?? SPATIAL_PAD,
    top: extras.top ?? SPATIAL_PAD,
    bottom: extras.bottom ?? SPATIAL_PAD,
  };
}

export function plotRect(frame: SpatialFrame): Box {
  return {
    x: frame.left,
    y: frame.top,
    width: Math.max(1, frame.width - frame.left - frame.right),
    height: Math.max(1, frame.height - frame.top - frame.bottom),
  };
}

export function plotCenter(frame: SpatialFrame): Vec {
  const plot = plotRect(frame);
  return { x: plot.x + plot.width / 2, y: plot.y + plot.height / 2 };
}

export function semanticToDisplay(point: SemanticPoint, frame: SpatialFrame): Vec {
  const plot = plotRect(frame);
  const cx = plot.x + plot.width / 2;
  const cy = plot.y + plot.height / 2;
  return {
    x: cx + point.x * (plot.width / 2),
    y: cy - point.y * (plot.height / 2),
  };
}

export function displayToSemantic(point: Vec, frame: SpatialFrame): SemanticPoint {
  const plot = plotRect(frame);
  const cx = plot.x + plot.width / 2;
  const cy = plot.y + plot.height / 2;
  const rx = plot.width / 2 || 1;
  const ry = plot.height / 2 || 1;
  return { x: (point.x - cx) / rx, y: (cy - point.y) / ry };
}

export function boxFromCenter(center: Vec, size: { width: number; height: number }): Box {
  return {
    x: center.x - size.width / 2,
    y: center.y - size.height / 2,
    width: size.width,
    height: size.height,
  };
}

export function boxCenter(box: Box): Vec {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function rotate(point: Vec, radians: number): Vec {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

export function normalize(x: number, y: number): Vec {
  const dist = Math.hypot(x, y) || 1;
  return { x: x / dist, y: y / dist };
}

export function frameFitScale(boxes: Box[], frame: SpatialFrame, pad = 6) {
  const cx = frame.width / 2;
  const cy = frame.height / 2;
  const availX = Math.max(1, cx - pad);
  const availY = Math.max(1, cy - pad);
  let need = 1;
  for (const box of boxes) {
    need = Math.max(
      need,
      (cx - box.x) / availX,
      (cy - box.y) / availY,
      (box.x + box.width - cx) / availX,
      (box.y + box.height - cy) / availY,
    );
  }
  return Math.min(1, 1 / need);
}

export function boxLeaves(box: Box, frame: SpatialFrame, slack = 0) {
  return (
    box.x < slack ||
    box.y < slack ||
    box.x + box.width > frame.width - slack ||
    box.y + box.height > frame.height - slack
  );
}
