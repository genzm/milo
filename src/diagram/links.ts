import {
  type DiagramScene,
  type DiagramLink,
  type DiagramBox,
  type DiagramPlacedItem,
} from './types';
import { perimeterLink } from './geometry.ts';
import { routeConnection as connection } from '../flow/route.ts';

function pairKey(from: string, to: string) {
  return from < to ? `${from}::${to}` : `${to}::${from}`;
}

export function resolvedLinks(scene: DiagramScene): DiagramLink[] {
  const links = [...scene.links];
  if (scene.options.connect !== 'cycle' || scene.items.length < 2) return links;
  const directed = new Set(
    links.filter((link) => link.kind !== 'undirected').map((link) => pairKey(link.from, link.to)),
  );
  const seen = new Set(links.map((link) => pairKey(link.from, link.to)));
  const ringItems =
    scene.options.layout === 'radial' && scene.options.center
      ? scene.items.filter((item) => item.id !== scene.options.center)
      : scene.items;
  for (let i = 0; i < ringItems.length; i++) {
    const from = ringItems[i].id;
    const to = ringItems[(i + 1) % ringItems.length].id;
    if (from === to) continue;
    const key = pairKey(from, to);
    if (seen.has(key) || directed.has(key)) continue;
    seen.add(key);
    links.push({ from, to, kind: 'undirected', label: '' });
  }
  return links;
}

function circlePath(from: DiagramBox, to: DiagramBox) {
  const a = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const b = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const dx = b.x - a.x,
    dy = b.y - a.y,
    dist = Math.hypot(dx, dy) || 1;
  const ra = Math.min(from.width, from.height) / 2;
  const rb = Math.min(to.width, to.height) / 2;
  const start = { x: a.x + (dx / dist) * ra, y: a.y + (dy / dist) * ra };
  const end = { x: b.x - (dx / dist) * rb, y: b.y - (dy / dist) * rb };
  return {
    path: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
    labelAt: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 - 10 },
  };
}

export function linkGeometry(
  from: DiagramPlacedItem,
  to: DiagramPlacedItem,
  perimeter = false,
): { path: string; labelAt: { x: number; y: number } } {
  if (
    perimeter ||
    from.kind === 'card' ||
    to.kind === 'card' ||
    from.kind === 'dot' ||
    to.kind === 'dot'
  ) {
    const geometry = perimeterLink(from, to, {
      from: from.kind === 'dot' || from.kind === 'vertex' ? 'circle' : 'capsule',
      to: to.kind === 'dot' || to.kind === 'vertex' ? 'circle' : 'capsule',
    });
    return geometry || { path: '', labelAt: { x: 0, y: 0 } };
  }
  if (from.kind === 'vertex' && to.kind === 'vertex') return circlePath(from, to);
  const geometry = connection(from, to, 'straight');
  return { path: geometry.path, labelAt: geometry.label };
}
