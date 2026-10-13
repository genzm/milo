import { cacheGet, cacheSet } from './cache';
import { SourceStore, normalize, type Block } from './source';
import type { Autosaver } from './save';

type DraftBlock = Pick<Block, 'id' | 'kind' | 'name' | 'text'>;
export interface Draft {
  version: 1;
  base: string;
  content: string;
  blocks: DraftBlock[];
  when: number;
  reason: 'edit' | 'hidden' | 'conflict' | 'saved';
}
function blockFingerprint(blocks: Iterable<Pick<Block, 'id' | 'kind' | 'name' | 'text'>>) {
  let a = 0x811c9dc5,
    b = 0x9e3779b9,
    length = 0;
  const feed = (value: string) => {
    const s = value.length + ':' + value;
    length += s.length;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193);
      b = Math.imul((b ^ c) >>> 0, 0x85ebca6b);
      b ^= b >>> 13;
    }
  };
  let count = 0;
  for (const block of blocks) {
    count++;
    feed(block.id);
    feed(block.kind);
    feed(block.name);
    feed(normalize(block.text));
  }
  return `${count}:${length}:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`;
}

type DraftStorage = 'active' | 'conflict';
interface Cache {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<boolean>;
}

export class DraftStore {
  private base: string;
  private keys: Record<DraftStorage | 'previous', string>;

  constructor(
    cacheKey: string,
    private store: SourceStore,
    baseline: Block[],
    private cache: Cache = { get: cacheGet, set: cacheSet },
  ) {
    this.base = blockFingerprint(baseline);
    this.keys = {
      active: 'draft:' + cacheKey,
      conflict: 'conflict:' + cacheKey,
      previous: 'previous:' + cacheKey,
    };
  }

  rebase(blocks: Block[]) {
    this.base = blockFingerprint(blocks);
  }

  async persist(reason: Draft['reason'] = 'edit'): Promise<Draft | null> {
    const blocks = this.store.list().map(({ id, kind, name, text }) => ({ id, kind, name, text }));
    const draft: Draft = {
      version: 1,
      base: this.base,
      content: blockFingerprint(blocks),
      blocks,
      when: Date.now(),
      reason,
    };
    return (await this.cache.set(this.keys.active, draft)) ? draft : null;
  }

  discard(storage: DraftStorage = 'active') {
    return this.cache.set(this.keys[storage], undefined);
  }

  async archive(saver: Pick<Autosaver, 'state' | 'dirty'>) {
    const draft = (await this.cache.get(this.keys.active)) as Draft | undefined;
    if (
      !draft?.blocks?.length ||
      saver.state !== 'saved' ||
      saver.dirty() ||
      draft.content !== blockFingerprint(this.store.list())
    )
      return;
    if (await this.cache.set(this.keys.previous, { ...draft, reason: 'saved' } satisfies Draft)) {
      await this.discard();
    }
  }

  async preserveConflict() {
    const draft = await this.persist('conflict');
    if (!draft || !(await this.cache.set(this.keys.conflict, draft))) return false;
    await this.discard();
    return true;
  }

  async recovery() {
    const active = (await this.cache.get(this.keys.active)) as Draft | undefined;
    const conflict = (await this.cache.get(this.keys.conflict)) as Draft | undefined;
    const draft = active?.blocks?.length ? active : conflict?.blocks?.length ? conflict : undefined;
    if (
      draft &&
      JSON.stringify(draft.blocks.map((b) => [b.id, b.text])) !==
        JSON.stringify(this.store.list().map((b) => [b.id, b.text]))
    ) {
      return {
        draft,
        storage: (active?.blocks?.length ? 'active' : 'conflict') as DraftStorage,
        changedBase: Boolean(draft.base && draft.base !== blockFingerprint(this.store.list())),
      };
    }
    if (active?.blocks?.length) await this.discard();
    return null;
  }

  restore(draft: Draft) {
    const ids = new Set(draft.blocks.map((b) => b.id));
    for (const block of draft.blocks) {
      if (this.store.blocks.has(block.id)) this.store.setText(block.id, block.text);
      else this.store.add(block);
    }
    for (const block of this.store.list()) {
      if (!ids.has(block.id) && block.id !== 'manifest') this.store.remove(block.id);
    }
    let before: string | null = null;
    for (const id of draft.blocks
      .filter((b) => b.kind === 'slide')
      .map((b) => b.id)
      .reverse()) {
      this.store.moveBefore(id, before);
      before = id;
    }
  }
}
