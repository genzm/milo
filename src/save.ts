export interface FileHandle {
  name: string;
  getFile: () => Promise<{ arrayBuffer: () => Promise<ArrayBuffer>; text?: () => Promise<string> }>;
  queryPermission?: (o: any) => Promise<string>;
  requestPermission?: (o: any) => Promise<string>;
  createWritable: (
    o?: any,
  ) => Promise<{
    write: (data: string) => Promise<void>;
    close: () => Promise<void>;
    abort?: () => Promise<void>;
  }>;
}
export type SaveState =
  'disconnected' | 'pending' | 'saving' | 'saved' | 'conflict' | 'permission' | 'error';
export async function readFile(h: FileHandle): Promise<string> {
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
    await (await h.getFile()).arrayBuffer(),
  );
}
export class Autosaver {
  handle: FileHandle | null = null;
  baseline: string | null = null;
  state: SaveState = 'disconnected';
  message = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private disposed = false;
  private firstDirty = 0;
  private unverified: string | null = null;
  constructor(
    private current: () => string | null,
    private changed: (s: SaveState, message: string) => void,
  ) {}
  set(s: SaveState, message = '') {
    this.state = s;
    this.message = message;
    this.changed(s, message);
  }
  bind(handle: FileHandle, baseline: string) {
    this.handle = handle;
    this.baseline = baseline;
    this.unverified = null;
    this.disposed = false;
    this.firstDirty = 0;
    this.set('saved');
    if (this.current() !== baseline) this.schedule();
  }
  dirty() {
    return this.current() !== this.baseline;
  }
  schedule() {
    if (!this.handle) {
      this.set('disconnected');
      return;
    }
    if (['conflict', 'permission', 'error'].includes(this.state)) return;
    if (this.current() === this.baseline && !this.running) {
      this.firstDirty = 0;
      this.set('saved');
      return;
    }
    if (!this.firstDirty) this.firstDirty = Date.now();
    if (!this.running) this.set('pending');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(
      () => {
        this.timer = null;
        void this.flush();
      },
      Math.max(0, Math.min(500, 2000 - (Date.now() - this.firstDirty))),
    );
  }
  flush(): Promise<void> {
    if (this.running) return this.running;
    if (!this.handle || this.disposed || ['conflict', 'permission', 'error'].includes(this.state))
      return Promise.resolve();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.running = this.perform().finally(() => {
      this.running = null;
      if (
        !this.disposed &&
        !['conflict', 'permission', 'error'].includes(this.state) &&
        this.current() !== this.baseline
      )
        this.schedule();
    });
    return this.running;
  }
  private async perform() {
    const handle = this.handle!,
      snapshot = this.current();
    if (snapshot === null || snapshot === this.baseline) {
      this.set('saved');
      return;
    }
    let writer: Awaited<ReturnType<FileHandle['createWritable']>> | null = null;
    this.set('saving');
    try {
      if (
        handle.queryPermission &&
        (await handle.queryPermission({ mode: 'readwrite' })) !== 'granted'
      ) {
        this.set('permission', '書き込み許可を再接続してください。');
        return;
      }
      const before = await readFile(handle);
      if (before !== this.baseline) {
        // A previous close may have succeeded even if its verification read failed.
        if (this.unverified !== null && before === this.unverified) {
          this.baseline = before;
          this.unverified = null;
          if (snapshot === before) {
            this.firstDirty = 0;
            this.set('saved');
            return;
          }
        } else {
          this.set('conflict', 'ファイルが外部で変更されました。自動保存を停止しています。');
          return;
        }
      }
      writer = await handle.createWritable({ mode: 'exclusive' });
      // The API has no OS-wide compare-and-swap. Recheck immediately before writing.
      if ((await readFile(handle)) !== this.baseline) {
        await writer.abort?.();
        writer = null;
        this.set('conflict', '書き込み直前に外部変更を検知しました。');
        return;
      }
      this.unverified = snapshot;
      await writer.write(snapshot);
      await writer.close();
      writer = null;
      if ((await readFile(handle)) !== snapshot) {
        this.set('conflict', '保存直後にファイルの内容が変わりました。');
        return;
      }
      this.baseline = snapshot;
      this.unverified = null;
      this.firstDirty = 0;
      this.set(this.current() === snapshot ? 'saved' : 'pending');
    } catch (e: any) {
      try {
        await writer?.abort?.();
      } catch {}
      this.set(
        e?.name === 'NotAllowedError' ? 'permission' : 'error',
        e?.message || '保存できませんでした。',
      );
    }
  }
  async retry() {
    if (!this.handle) return;
    if (this.state === 'conflict') return;
    this.set('pending');
    await this.flush();
  }
  dispose() {
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
