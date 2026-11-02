import { VERTEX_R, LABEL_GAP, VERTEX, NOTE_STACK, NOTE_GAP, PAD, NOTE_MAX } from './constants';
import {
  type DiagramScene,
  type DiagramItem,
  type Vec,
  type DiagramBox,
  type DiagramPlacedItem,
  type DiagramNoteLink,
} from './types';
import {
  angle,
  pointOnRing,
  boxCenter,
  closestPointOnBox,
  normalize,
  overlaps,
  clampBox,
  outwardUnit,
  annotationBox,
  shiftAnnotation,
  segmentHitsBox,
  boxLeavesFrame,
} from './geometry-ring';
import {
  resolvedNoteMode,
  estimateLabelSize,
  estimateTitleSize,
  estimateNoteSize,
} from './metrics';
import { resolvedLinks } from './links';

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

export function layoutRing(
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
