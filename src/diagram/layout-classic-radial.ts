import { type DiagramScene, type DiagramPlacedItem } from './types';
import { estimateCardSize } from './metrics';
import { PAD } from './constants';
import { angle } from './geometry-ring';
import { frameFitScale, spatialFrame, unreadablySmall } from './spatial.ts';

export function layoutRadial(scene: DiagramScene, cardSizes: { width: number; height: number }[]) {
  const { width, height, start, order, center } = scene.options;
  const satellites = scene.items.filter((item) => item.id !== center);
  const sizes = scene.items.map(
    (item, i) => cardSizes[i] || estimateCardSize(item, item.id === center),
  );
  // Use the available horizontal space instead of clamping individual cards
  // against the frame, which destroys spacing when the orbit is too large.
  const stretchX = Math.max(
    1,
    (width - Math.max(...sizes.map((size) => size.width)) - PAD * 2) /
      Math.max(1, height - Math.max(...sizes.map((size) => size.height)) - PAD * 2),
  );
  let orbit = 0;
  const directions = scene.items.map((item) => {
    if (item.id === center) return { x: 0, y: 0 };
    const phi = angle(orbit++, satellites.length, start, order);
    return { x: Math.sin(phi) * stretchX, y: -Math.cos(phi) };
  });
  let minR = 0;
  let maxR = Infinity;
  for (let i = 0; i < sizes.length; i++) {
    const dir = directions[i];
    if (Math.abs(dir.x) > 1e-6)
      maxR = Math.min(maxR, (width / 2 - PAD - sizes[i].width / 2) / Math.abs(dir.x));
    if (Math.abs(dir.y) > 1e-6)
      maxR = Math.min(maxR, (height / 2 - PAD - sizes[i].height / 2) / Math.abs(dir.y));
    for (let j = 0; j < i; j++) {
      const dx = Math.abs(dir.x - directions[j].x);
      const dy = Math.abs(dir.y - directions[j].y);
      // Every pair must be separated along at least one axis, including
      // satellite pairs (not just each satellite and the central card).
      minR = Math.max(
        minR,
        Math.min(
          dx > 1e-6 ? ((sizes[i].width + sizes[j].width) / 2 + 28) / dx : Infinity,
          dy > 1e-6 ? ((sizes[i].height + sizes[j].height) / 2 + 28) / dy : Infinity,
        ),
      );
    }
  }
  const radius = Math.max(minR, Math.min(maxR, minR + 36));
  const items: DiagramPlacedItem[] = scene.items.map((item, i) => ({
    id: item.id,
    kind: 'card',
    x: width / 2 + directions[i].x * radius - sizes[i].width / 2,
    y: height / 2 + directions[i].y * radius - sizes[i].height / 2,
    ...sizes[i],
  }));
  const fitScale = frameFitScale(items, spatialFrame(width, height), PAD);
  const overflowReason = unreadablySmall(fitScale) ? ('read' as const) : undefined;
  return { items, fitScale, overflow: Boolean(overflowReason), overflowReason };
}
