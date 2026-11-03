export type AnnotationTone = 'accent' | 'default' | 'muted';
export type AnnotationSide = 'top' | 'right' | 'bottom' | 'left';
export type AnnotationDirection = 'right' | 'left' | 'down' | 'up';
interface ArrowBase {
  kind: 'arrow';
  id: string;
  tone: AnnotationTone;
  label: string;
  size: number;
}
export type ArrowAnnotation = ArrowBase &
  (
    | { from: string; to: string; target?: never; side?: never; direction?: never; offset?: never }
    | {
        target: string;
        side: AnnotationSide;
        direction: AnnotationDirection;
        offset: number;
        from?: never;
        to?: never;
      }
  );
export interface CrossAnnotation {
  kind: 'cross';
  target: string;
  tone: AnnotationTone;
  label: string;
  scale: number;
  size?: number;
}
export interface CompositionPart {
  id: string;
  source: string;
  line: number;
  width?: number;
}
export interface CompositionScene {
  layout: 'row' | 'column';
  gap: number;
  parts: CompositionPart[];
  annotations: (ArrowAnnotation | CrossAnnotation)[];
}
export function parseComposition(source: string, options?: string): CompositionScene;
