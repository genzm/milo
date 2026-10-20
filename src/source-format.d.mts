export const SOURCE_TYPE: 'application/x-milo-source';
export function encode(text: string): string;
export function decode(text: string): string;
export function serializeBlock(
  block: {
    id: string;
    kind: 'manifest' | 'slide' | 'asset';
    name: string;
    text: string;
  },
  eol?: string,
): string;
