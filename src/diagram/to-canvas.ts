import { type CanvasArrows, type CanvasScene } from '../canvas/types.ts';
import { resolvedLinks } from './links';
import { type DiagramLinkKind, type DiagramScene } from './types';

function arrowsFor(kind: DiagramLinkKind): CanvasArrows {
  return kind === 'both' ? 'both' : kind === 'forward' ? 'end' : 'none';
}

export function toCanvasScene(scene: DiagramScene): CanvasScene {
  const links = resolvedLinks(scene);
  return {
    options: {
      layout: 'flow',
      direction: scene.options.direction,
      width: scene.options.width,
      height: scene.options.height,
      autoHeight: scene.options.autoHeight,
      gap: scene.options.gap,
      route: scene.options.route,
    },
    nodes: scene.items.map((item) => ({
      id: item.id,
      markdown: item.markdown ? `### ${item.title}\n\n${item.markdown}` : `### ${item.title}`,
      shape: item.shape === 'vertex' ? 'ellipse' : 'card',
      fill: 'solid' as const,
      tone:
        item.level === 'high'
          ? 'accent'
          : item.level === 'medium'
            ? 'muted'
            : item.level === 'low'
              ? 'default'
              : 'default',
      width: scene.options.nodeWidth,
      dx: 0,
      dy: 0,
      pinned: false,
    })),
    edges: links.map((link) => ({
      from: link.from,
      to: link.to,
      label: link.label,
      tone: 'default' as const,
      dashed: false,
      arrows: arrowsFor(link.kind),
    })),
  };
}
