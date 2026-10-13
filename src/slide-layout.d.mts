export type SlideLayout = 'cover' | 'section' | 'lab' | 'media' | 'essay';
export const LAYOUTS: readonly SlideLayout[];
export function slideLayout(text: string): SlideLayout | undefined;
export function setSlideLayout(text: string, layout: SlideLayout): string;
