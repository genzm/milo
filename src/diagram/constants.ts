import { type DiagramNoteSide, type Vec, type DiagramStart } from './types';

export const VERTEX = 92;

export const VERTEX_R = VERTEX / 2;

export const LABEL_GAP = 18;

export const NOTE_GAP = 22;

export const NOTE_STACK = 6;

export const NOTE_MAX = 260;

export const NOTE_FONT = 18;

export const TITLE_FONT = 27;

export const PAD = 28;

export const NOTE_SIDE_VECTOR: Record<Exclude<DiagramNoteSide, 'auto'>, Vec> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};

export const START_PHI: Record<DiagramStart, number> = {
  top: 0,
  right: Math.PI / 2,
  bottom: Math.PI,
  left: -Math.PI / 2,
};
