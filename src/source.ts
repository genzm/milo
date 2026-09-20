import { parse as parseHTML } from 'parse5';
import {
  parse as parseJSON,
  parseTree,
  findNodeAtLocation,
  modify,
  applyEdits,
  type ParseError,
} from 'jsonc-parser';

export const SOURCE_TYPE = 'application/x-milo-source';
export const END_MARKER = '<!-- END MILO SOURCES -->';
export type Kind = 'manifest' | 'slide' | 'model' | 'component' | 'asset';
export const GROUP_END_MARKERS: Record<Kind, string> = {
  manifest: '<!-- END MILO SETTINGS -->',
  slide: '<!-- END MILO SLIDES -->',
  model: '<!-- END MILO MODELS -->',
  component: '<!-- END MILO COMPONENTS -->',
  asset: '<!-- END MILO ASSETS -->',
};
export interface Block {
  id: string;
  kind: Kind;
  name: string;
  text: string;
  start?: number;
  end?: number;
  tagStart?: number;
  tagEnd?: number;
}
export interface Snapshot {
  html: string | null;
  blocks: Block[];
}
export const encode = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\0/g, '&#0;');
export const decode = (s: string) =>
  s.replace(/&(?:amp|lt|#0);/g, (s) => (s === '&amp;' ? '&' : s === '&lt;' ? '<' : '\0'));
export const normalize = (s: string) => s.replace(/\r\n?/g, '\n');
export function json<T = any>(text: string): T {
  const errors: ParseError[] = [];
  const result = parseJSON(text, errors, { allowTrailingComma: true });
  if (errors.length) throw new Error(`JSONCの構文を確認してください（位置 ${errors[0].offset}）。`);
  return result;
}
function attrEscape(s: string) {
  return s.replace(
    /[&"<>]/g,
    (c) => ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' })[c]!,
  );
}
export function serializeBlock(b: Block, eol = '\n'): string {
  if (!/^[a-zA-Z][\w-]*$/.test(b.id)) throw new Error('不正なブロックIDです。');
  return `<script${eol}  type="${SOURCE_TYPE}"${eol}  id="${b.id}"${eol}  data-kind="${b.kind}"${eol}  data-name="${attrEscape(b.name)}"${eol}  data-codec="amp-lt-v1">${eol}${encode(b.text)}${eol}</script>`;
}
function contentBounds(html: string, start: number, end: number) {
  if (html.slice(start, start + 2) === '\r\n') start += 2;
  else if (html[start] === '\n') start++;
  if (html.slice(end - 2, end) === '\r\n') end -= 2;
  else if (html[end - 1] === '\n') end--;
  return { start, end: Math.max(start, end) };
}
const kindOrder: Kind[] = ['manifest', 'slide', 'model', 'component', 'asset'];
function lastIndexWhere<T>(items: T[], test: (item: T) => boolean) {
  for (let i = items.length - 1; i >= 0; i--) if (test(items[i])) return i;
  return -1;
}
function rawOffset(raw: string, decodedOffset: number): number {
  let r = 0,
    d = 0;
  while (d < decodedOffset && r < raw.length) {
    if (raw.startsWith('&amp;', r)) r += 5;
    else if (raw.startsWith('&lt;', r)) r += 4;
    else if (raw.startsWith('&#0;', r)) r += 4;
    else r++;
    d++;
  }
  if (d !== decodedOffset) throw new Error('ソースの位置が一致しません。');
  return r;
}

export class SourceStore {
  html: string | null;
  blocks = new Map<string, Block>();
  revision = 0;
  constructor(snapshot: Snapshot) {
    this.html = snapshot.html;
    for (const b of snapshot.blocks) {
      if (this.blocks.has(b.id)) throw new Error(`IDが重複しています: ${b.id}`);
      this.blocks.set(b.id, { ...b });
    }
  }
  static fromHTML(html: string): SourceStore {
    const doc: any = parseHTML(html, { sourceCodeLocationInfo: true });
    const blocks: Block[] = [];
    let format = false;
    function walk(n: any) {
      const attrs = Object.fromEntries((n.attrs ?? []).map((a: any) => [a.name, a.value]));
      if (n.tagName === 'meta' && attrs.name === 'milo' && attrs.content === '1') format = true;
      if (n.tagName === 'script' && attrs.type === SOURCE_TYPE) {
        const loc = n.sourceCodeLocation;
        if (!loc?.endTag || attrs['data-codec'] !== 'amp-lt-v1')
          throw new Error('ソース区画が壊れています。');
        const { start, end } = contentBounds(html, loc.startTag.endOffset, loc.endTag.startOffset);
        blocks.push({
          id: attrs.id,
          kind: attrs['data-kind'],
          name: attrs['data-name'] || attrs.id,
          text: decode(html.slice(start, end)),
          start,
          end,
          tagStart: loc.startOffset,
          tagEnd: loc.endOffset,
        });
      }
      for (const c of n.childNodes ?? []) walk(c);
    }
    walk(doc);
    const completeSections = Object.values(GROUP_END_MARKERS).every((marker) =>
      html.includes(marker),
    );
    if (
      !format ||
      !blocks.some((b) => b.id === 'manifest') ||
      !completeSections ||
      !html.includes(END_MARKER)
    )
      throw new Error('milo形式のHTMLを選んでください。');
    return new SourceStore({ html, blocks });
  }
  static fromDOM(doc: Document): SourceStore {
    const blocks = [
      ...doc.querySelectorAll<HTMLScriptElement>(`script[type="${SOURCE_TYPE}"]`),
    ].map((el) => {
      let raw = el.textContent ?? '';
      if (raw.startsWith('\n')) raw = raw.slice(1);
      if (raw.endsWith('\n')) raw = raw.slice(0, -1);
      return {
        id: el.id,
        kind: el.dataset.kind as Kind,
        name: el.dataset.name || el.id,
        text: decode(raw),
      };
    });
    return new SourceStore({ html: null, blocks });
  }
  get(id: string) {
    const b = this.blocks.get(id);
    if (!b) throw new Error(`見つかりません: ${id}`);
    return b;
  }
  list(kind?: Kind) {
    return [...this.blocks.values()].filter((b) => !kind || b.kind === kind);
  }
  snapshot(): Snapshot {
    return { html: this.html, blocks: this.list().map((b) => ({ ...b })) };
  }
  restore(s: Snapshot) {
    this.html = s.html;
    this.blocks = new Map(s.blocks.map((b) => [b.id, { ...b }]));
    this.revision++;
  }
  replace(id: string, from: number, to: number, insert: string): boolean {
    const b = this.get(id);
    if (from < 0 || to < from || to > b.text.length) throw new Error('編集範囲が不正です。');
    if (b.text.slice(from, to) === insert) return false;
    if (this.html !== null) {
      const raw = this.html.slice(b.start!, b.end!);
      const a = b.start! + rawOffset(raw, from),
        z = b.start! + rawOffset(raw, to);
      const replacement = encode(insert),
        delta = replacement.length - (z - a);
      this.html = this.html.slice(0, a) + replacement + this.html.slice(z);
      b.end! += delta;
      b.tagEnd! += delta;
      for (const other of this.blocks.values())
        if (other !== b && other.start! >= z) {
          other.start! += delta;
          other.end! += delta;
          other.tagStart! += delta;
          other.tagEnd! += delta;
        }
    }
    b.text = b.text.slice(0, from) + insert + b.text.slice(to);
    this.revision++;
    return true;
  }
  setText(id: string, next: string): boolean {
    const old = this.get(id).text;
    if (old === next) return false;
    let a = 0;
    while (a < old.length && a < next.length && old[a] === next[a]) a++;
    let z = old.length,
      n = next.length;
    while (z > a && n > a && old[z - 1] === next[n - 1]) {
      z--;
      n--;
    }
    return this.replace(id, a, z, next.slice(a, n));
  }
  setJSON(id: string, path: (string | number)[], value: any): boolean {
    const text = this.get(id).text;
    json(text); // Never edit a partially parsed document.
    const tree = parseTree(text, [], { allowTrailingComma: true });
    const node = tree && findNodeAtLocation(tree, path);
    if (node && (value === null || ['number', 'string', 'boolean'].includes(typeof value))) {
      if (node.value === value) return false;
      if (typeof value === 'number' && !Number.isFinite(value))
        throw new Error('有限の数値を入力してください。');
      return this.replace(id, node.offset, node.offset + node.length, JSON.stringify(value));
    }
    const edited = applyEdits(
      text,
      modify(text, path, value, {
        formattingOptions: {
          insertSpaces: true,
          tabSize: 2,
          eol: text.includes('\r\n') ? '\r\n' : '\n',
        },
      }),
    );
    return this.setText(id, edited);
  }
  add(b: Block, beforeId?: string | null) {
    if (this.blocks.has(b.id)) throw new Error('IDが重複しています。');
    const before = beforeId ? this.get(beforeId) : null;
    if (before && before.kind !== b.kind)
      throw new Error('同じ種類のソースの前にだけ追加できます。');
    if (this.html === null) {
      const entries = [...this.blocks.entries()];
      let at = before ? entries.findIndex(([id]) => id === before.id) : -1;
      if (at < 0) {
        const same = lastIndexWhere(entries, ([, v]) => v.kind === b.kind);
        if (same >= 0) at = same + 1;
        else {
          const rank = kindOrder.indexOf(b.kind);
          at = entries.findIndex(([, v]) => kindOrder.indexOf(v.kind) > rank);
          if (at < 0) at = entries.length;
        }
      }
      entries.splice(at, 0, [b.id, { ...b }]);
      this.blocks = new Map(entries);
    } else {
      const at = before ? before.tagStart! : this.html.lastIndexOf(GROUP_END_MARKERS[b.kind]);
      if (at < 0) throw new Error('ソース区画の終端が見つかりません。');
      const eol = this.html.includes('\r\n') ? '\r\n' : '\n';
      const updated = SourceStore.fromHTML(
        this.html.slice(0, at) + serializeBlock(b, eol) + eol + eol + this.html.slice(at),
      );
      this.html = updated.html;
      this.blocks = updated.blocks;
    }
    this.revision++;
  }
  remove(id: string) {
    const b = this.get(id);
    if (id === 'manifest') throw new Error('文書設定は削除できません。');
    if (this.html === null) this.blocks.delete(id);
    else {
      const start = b.tagStart!;
      let end = b.tagEnd!;
      if (this.html.slice(end, end + 2) === '\r\n') end += 2;
      else if (this.html[end] === '\n') end++;
      const updated = SourceStore.fromHTML(this.html.slice(0, start) + this.html.slice(end));
      this.html = updated.html;
      this.blocks = updated.blocks;
    }
    this.revision++;
  }
  moveBefore(id: string, beforeId?: string | null): boolean {
    const b = this.get(id),
      before = beforeId ? this.get(beforeId) : null;
    if (before && before.kind !== b.kind) throw new Error('同じ種類のソースの間だけ移動できます。');
    if (before?.id === id) return false;
    const ids = this.list(b.kind).map((x) => x.id),
      index = ids.indexOf(id);
    if ((ids[index + 1] || null) === (before?.id || null)) return false;
    if (this.html === null) {
      const entries = [...this.blocks.entries()],
        from = entries.findIndex(([key]) => key === id),
        [entry] = entries.splice(from, 1);
      let at = before
        ? entries.findIndex(([key]) => key === before.id)
        : lastIndexWhere(entries, ([, v]) => v.kind === b.kind) + 1;
      if (at < 0) at = entries.length;
      entries.splice(at, 0, entry);
      this.blocks = new Map(entries);
    } else {
      const start = b.tagStart!,
        chunk = this.html.slice(start, b.tagEnd!);
      let end = b.tagEnd!;
      for (let i = 0; i < 2; i++) {
        if (this.html.slice(end, end + 2) === '\r\n') end += 2;
        else if (this.html[end] === '\n') end++;
        else break;
      }
      const without = SourceStore.fromHTML(this.html.slice(0, start) + this.html.slice(end));
      const target = before ? without.get(before.id) : null;
      const at = target ? target.tagStart! : without.html!.lastIndexOf(GROUP_END_MARKERS[b.kind]);
      if (at < 0) throw new Error('ソース区画の終端が見つかりません。');
      const eol = without.html!.includes('\r\n') ? '\r\n' : '\n';
      const updated = SourceStore.fromHTML(
        without.html!.slice(0, at) + chunk + eol + eol + without.html!.slice(at),
      );
      this.html = updated.html;
      this.blocks = updated.blocks;
    }
    this.revision++;
    return true;
  }
  // Attach to the original file without serializing the browser DOM.
  attach(disk: SourceStore, boot: Snapshot) {
    const initial = new Map(boot.blocks.map((b) => [b.id, b]));
    if (
      disk.blocks.size !== initial.size ||
      boot.blocks.some((b) => {
        const d = disk.blocks.get(b.id);
        return !d || d.kind !== b.kind || normalize(d.text) !== normalize(b.text);
      })
    )
      throw new Error(
        '選んだファイルは、開いている文書と内容が異なります。そのHTMLを開き直して接続してください。',
      );
    for (const b of this.list()) {
      if (initial.has(b.id)) {
        if (normalize(b.text) !== normalize(initial.get(b.id)!.text)) disk.setText(b.id, b.text);
      } else disk.add(b);
    }
    for (const id of initial.keys()) if (!this.blocks.has(id)) disk.remove(id);
    let before: string | null = null;
    for (const id of this.list('slide')
      .map((b) => b.id)
      .reverse()) {
      disk.moveBefore(id, before);
      before = id;
    }
    this.html = disk.html;
    this.blocks = disk.blocks;
    this.revision++;
  }
}
