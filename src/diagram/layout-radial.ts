import { rayHalf } from './geometry.ts';
import {
  DISTANCE_RANK,
  SIDE_SEMANTIC,
  boxFromCenter,
  boxLeaves,
  frameFitScale,
  normalize,
  plotCenter,
  rotate,
  semanticToDisplay,
  spatialFrame,
  type SemanticPoint,
  type SpatialDistance,
  type SpatialFrame,
  type SpatialSide,
} from './spatial.ts';

export interface RadialSpatialItem {
  id: string;
  side: SpatialSide;
  distance?: SpatialDistance;
}

export interface RadialSpatialScene {
  options: {
    width: number;
    height: number;
    center: string;
    start: 'top' | 'right' | 'bottom' | 'left';
    order: 'ccw' | 'cw';
  };
  items: RadialSpatialItem[];
}

const START_PHI = {
  top: 0,
  right: Math.PI / 2,
  bottom: Math.PI,
  left: -Math.PI / 2,
};

export function usesSpatialRadial(scene: RadialSpatialScene) {
  return scene.items.some(
    (item) => item.id !== scene.options.center && (item.side !== 'auto' || item.distance),
  );
}

function defaultPhi(
  index: number,
  count: number,
  start: RadialSpatialScene['options']['start'],
  order: RadialSpatialScene['options']['order'],
) {
  if (count < 1) return 0;
  const step = (2 * Math.PI) / count;
  const sign = order === 'cw' ? 1 : -1;
  return START_PHI[start] + sign * index * step;
}

function unitFor(item: RadialSpatialItem, phi: number): SemanticPoint {
  if (item.side !== 'auto') return SIDE_SEMANTIC[item.side];
  return { x: Math.sin(phi), y: Math.cos(phi) };
}

export function layoutRadialSpatial(
  scene: RadialSpatialScene,
  sizes: { width: number; height: number }[],
) {
  const { width, height, center, start, order } = scene.options;
  const hubIndex = scene.items.findIndex((item) => item.id === center);
  const satellites = scene.items
    .map((item, i) => ({ item, i }))
    .filter((entry) => entry.i !== hubIndex);
  const sizeAt = (index: number) => sizes[index] || { width: 120, height: 48 };
  const groups = new Map<string, number[]>();
  satellites.forEach((entry, orbit) => {
    const key = entry.item.side === 'auto' ? `auto:${orbit}` : entry.item.side;
    const list = groups.get(key) || [];
    list.push(orbit);
    groups.set(key, list);
  });
  const spreadOf = (orbit: number) => {
    const entry = satellites[orbit];
    const key = entry.item.side === 'auto' ? `auto:${orbit}` : entry.item.side;
    const list = groups.get(key) || [orbit];
    if (list.length < 2) return 0;
    const rank = list.indexOf(orbit);
    return 0.28 * (rank - (list.length - 1) / 2);
  };

  const frame: SpatialFrame = spatialFrame(width, height);
  const hubSize = sizeAt(hubIndex);
  const origin = plotCenter(frame);
  const plot = {
    width: frame.width - frame.left - frame.right,
    height: frame.height - frame.top - frame.bottom,
  };
  const orbits = satellites.map((entry, orbit) => {
    const phi = defaultPhi(orbit, satellites.length, start, order);
    const unit = rotate(unitFor(entry.item, phi), spreadOf(orbit));
    const displayDir = normalize(unit.x, -unit.y);
    const sat = sizeAt(entry.i);
    const rank = DISTANCE_RANK[entry.item.distance || 'mid'];
    const minR =
      rayHalf(hubSize, displayDir.x, displayDir.y) + rayHalf(sat, displayDir.x, displayDir.y) + 24;
    return { entry, unit, sat, rank, minR };
  });
  let radius = 0;
  for (const orbit of orbits) radius = Math.max(radius, orbit.minR / orbit.rank);
  if (radius <= 0) radius = 120;

  const placed = scene.items.map((item) => ({
    id: item.id,
    kind: 'card' as const,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    semantic: { x: 0, y: 0 },
  }));
  placed[hubIndex] = {
    id: scene.items[hubIndex].id,
    kind: 'card',
    ...boxFromCenter(origin, hubSize),
    semantic: { x: 0, y: 0 },
  };
  for (const orbit of orbits) {
    const dist = orbit.rank * radius;
    const semantic = {
      x: (orbit.unit.x * dist) / (plot.width / 2 || 1),
      y: (orbit.unit.y * dist) / (plot.height / 2 || 1),
    };
    placed[orbit.entry.i] = {
      id: orbit.entry.item.id,
      kind: 'card',
      ...boxFromCenter(semanticToDisplay(semantic, frame), orbit.sat),
      semantic,
    };
  }
  const fitScale = frameFitScale(placed, frame);

  return {
    items: placed,
    overflow:
      fitScale < 0.6 || (fitScale >= 0.999 && placed.some((item) => boxLeaves(item, frame, 2))),
    fitScale,
    frame,
  };
}
