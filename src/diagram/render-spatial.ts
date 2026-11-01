import type { Box } from './spatial.ts';

export interface SpatialGuide {
  kind: 'axis' | 'label';
  path?: string;
  text?: string;
  x?: number;
  y?: number;
  anchor?: 'start' | 'middle' | 'end';
}

export interface SpatialRegion {
  id: string;
  kind: 'zone' | 'cluster';
  label: string;
  tone: string;
  box: Box;
  labelBox?: Box;
  marks?: { x: number; y: number; r: number }[];
}

export function regionRect(box: Box) {
  return {
    x: box.x,
    y: box.y,
    width: Math.max(1, box.width),
    height: Math.max(1, box.height),
  };
}

export function spatialSignature(input: {
  overflow: boolean;
  items: { x: number; y: number; label?: Box; note?: Box }[];
  regions?: SpatialRegion[];
  guides?: SpatialGuide[];
  noteLinks?: { path: string }[];
  links?: { path: string }[];
}) {
  return JSON.stringify({
    o: input.overflow,
    n: (input.noteLinks || []).map((link) => link.path),
    e: (input.links || []).map((link) => link.path),
    r: (input.regions || []).map((region) => [
      region.id,
      Math.round(region.box.x),
      Math.round(region.box.y),
      Math.round(region.box.width),
      Math.round(region.box.height),
      region.labelBox && [
        Math.round(region.labelBox.x),
        Math.round(region.labelBox.y),
        Math.round(region.labelBox.width),
        Math.round(region.labelBox.height),
      ],
      (region.marks || []).map((mark) => [
        Math.round(mark.x),
        Math.round(mark.y),
        Math.round(mark.r),
      ]),
    ]),
    g: (input.guides || []).map((guide) => guide.path || `${guide.text}:${guide.x}:${guide.y}`),
    i: input.items.map((item) => [
      Math.round(item.x),
      Math.round(item.y),
      item.label && [
        Math.round(item.label.x),
        Math.round(item.label.y),
        Math.round(item.label.width),
        Math.round(item.label.height),
      ],
      item.note && [
        Math.round(item.note.x),
        Math.round(item.note.y),
        Math.round(item.note.width),
        Math.round(item.note.height),
      ],
    ]),
  });
}
