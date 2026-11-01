import { overlaps, rayHalf } from './geometry.ts';
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
  unreadablySmall,
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

const MAX_SPREAD = 0.7;
const PAIR_GAP = 16;

export type RadialOverflowReason = 'overlap' | 'read' | 'fit';

function perpHalf(side: SpatialSide, size: { width: number; height: number }) {
  return side === 'top' || side === 'bottom' ? size.width / 2 : size.height / 2;
}

function sameSideSpreads(
  groups: Map<string, number[]>,
  satellites: { item: RadialSpatialItem; i: number }[],
  sizeAt: (index: number) => { width: number; height: number },
  radius: number,
) {
  const spreads = satellites.map(() => 0);
  let overflow = false;
  for (const [key, list] of groups) {
    if (key.startsWith('auto:') || list.length < 2) continue;
    const side = satellites[list[0]].item.side;
    const halves = list.map((orbit) => perpHalf(side, sizeAt(satellites[orbit].i)));
    const dists = list.map((orbit) => {
      const rank = DISTANCE_RANK[satellites[orbit].item.distance || 'mid'];
      return Math.max(48, rank * radius);
    });
    const angles = [0];
    let cursor = 0;
    for (let i = 0; i < list.length - 1; i += 1) {
      cursor += (halves[i] + halves[i + 1] + PAIR_GAP) / Math.min(dists[i], dists[i + 1]);
      angles.push(cursor);
    }
    const mid = cursor / 2;
    let offset = angles.map((angle) => angle - mid);
    const peak = Math.max(0, ...offset.map((angle) => Math.abs(angle)));
    if (peak > MAX_SPREAD) {
      overflow = true;
      offset = offset.map((angle) => angle * (MAX_SPREAD / peak));
    }
    list.forEach((orbit, i) => {
      spreads[orbit] = offset[i];
    });
  }
  return { spreads, overflow };
}

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

  const frame: SpatialFrame = spatialFrame(width, height);
  const hubSize = sizeAt(hubIndex);
  const origin = plotCenter(frame);
  const plot = {
    width: frame.width - frame.left - frame.right,
    height: frame.height - frame.top - frame.bottom,
  };
  const buildOrbits = (spreads: number[]) =>
    satellites.map((entry, orbit) => {
      const phi = defaultPhi(orbit, satellites.length, start, order);
      const unit = rotate(unitFor(entry.item, phi), spreads[orbit] || 0);
      const displayDir = normalize(unit.x, -unit.y);
      const sat = sizeAt(entry.i);
      const rank = DISTANCE_RANK[entry.item.distance || 'mid'];
      const minR =
        rayHalf(hubSize, displayDir.x, displayDir.y) +
        rayHalf(sat, displayDir.x, displayDir.y) +
        24;
      return { entry, unit, sat, rank, minR };
    });
  const radiusOf = (orbits: ReturnType<typeof buildOrbits>) => {
    let radius = 0;
    for (const orbit of orbits) radius = Math.max(radius, orbit.minR / orbit.rank);
    return radius > 0 ? radius : 120;
  };
  let radius = radiusOf(buildOrbits(satellites.map(() => 0)));
  const spread = sameSideSpreads(groups, satellites, sizeAt, radius);
  const orbits = buildOrbits(spread.spreads);
  radius = radiusOf(orbits);

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
  const collide = satellites.some((entry, i) => {
    if (overlaps(placed[entry.i], placed[hubIndex], 0)) return true;
    return satellites.some((other, j) => j > i && overlaps(placed[entry.i], placed[other.i], 0));
  });
  const leftover = fitScale >= 0.999 && placed.some((item) => boxLeaves(item, frame, 2));
  const overflowReason: RadialOverflowReason | undefined = unreadablySmall(fitScale)
    ? 'read'
    : spread.overflow || collide
      ? 'overlap'
      : fitScale < 0.6 || leftover
        ? 'fit'
        : undefined;

  return {
    items: placed,
    overflow: Boolean(overflowReason),
    overflowReason,
    fitScale,
    frame,
  };
}
