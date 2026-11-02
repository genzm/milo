import { SourceStore, json, normalize, type Kind, type Snapshot } from '../source';
import { slideLayout } from '../slide-layout.mjs';

interface Manifest {
  title: string;
  slides: string[];
}

export class EditorSession {
  readonly store: SourceStore;
  boot: Snapshot;
  opening: Snapshot;
  current = 0;
  activeBlock = '';
  activeTab: Kind = 'slide';
  manifest: Manifest;
  manifestError = '';

  constructor(store: SourceStore) {
    this.store = store;
    this.boot = store.snapshot();
    this.opening = store.snapshot();
    this.manifest = { title: 'milo', slides: store.list('slide').map((b) => b.id) };
  }
  readManifest() {
    try {
      const m = json<any>(this.store.get('manifest').text),
        slides = this.store.list('slide').map((b) => b.id);
      if (!m || typeof m.title !== 'string' || !slides.length)
        throw new Error('title と1枚以上のスライドを指定してください。');
      for (const id of slides) slideLayout(this.store.get(id).text);
      this.manifest = { title: m.title, slides };
      this.manifestError = '';
      this.current = Math.max(0, Math.min(this.current, slides.length - 1));
    } catch (e: any) {
      this.manifestError = e.message;
      this.manifest.slides = this.store.list('slide').map((b) => b.id);
      this.current = Math.max(0, Math.min(this.current, this.manifest.slides.length - 1));
    }
  }
  currentId() {
    return this.manifest.slides[this.current] || this.store.list('slide')[0]?.id;
  }
  titleOf(id: string) {
    return (
      this.store.blocks.get(id)?.text.match(/^#\s+(.+)$/m)?.[1] ||
      this.store.blocks.get(id)?.name ||
      id
    );
  }
  layoutOf(id: string) {
    try {
      return slideLayout(this.store.get(id).text) ?? 'lab';
    } catch {
      return 'lab';
    }
  }
  slideOrderChanged() {
    const before = this.opening.blocks.filter((b) => b.kind === 'slide');
    const after = this.store.list('slide');
    return before.length !== after.length || before.some((b, i) => b.id !== after[i].id);
  }
  sourceChanged() {
    return (
      this.slideOrderChanged() ||
      this.store.list().length !== this.opening.blocks.length ||
      this.opening.blocks.some(
        (b) =>
          !this.store.blocks.has(b.id) ||
          normalize(this.store.get(b.id).text) !== normalize(b.text),
      )
    );
  }

  changedCount() {
    return (
      this.store
        .list()
        .filter((b) => this.opening.blocks.find((o) => o.id === b.id)?.text !== b.text).length +
      this.opening.blocks.filter((b) => !this.store.blocks.has(b.id)).length +
      Number(this.slideOrderChanged())
    );
  }

  rebase() {
    this.boot = this.store.snapshot();
    this.opening = this.store.snapshot();
  }

  mutate(change: () => void): boolean {
    const before = this.store.snapshot();
    const revision = this.store.revision;
    const selection = {
      current: this.current,
      activeBlock: this.activeBlock,
      activeTab: this.activeTab,
      manifest: { ...this.manifest, slides: [...this.manifest.slides] },
      manifestError: this.manifestError,
    };
    try {
      change();
      return this.store.revision !== revision;
    } catch (error) {
      this.store.restore(before);
      Object.assign(this, selection);
      throw error;
    }
  }
}
