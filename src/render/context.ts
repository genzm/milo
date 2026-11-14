import { SourceStore } from '../source';

export interface RenderContext {
  store: SourceStore;
  present: () => boolean;
  patchSource?: (from: number, to: number, replacement: string) => void;
  inspect: (id: string) => void;
  renderMarkdown?: (source: string) => string;
  renderInline?: (source: string) => string;
}
