import { SourceStore } from './source';

export const esc = (s: any) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function assetURL(text: string): string {
  const match = /^mime:\s*(image\/(?:gif|png|jpeg|webp|svg\+xml))\r?\n\r?\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error('画像素材の形式を確認してください。');
  if (match[1] === 'image/svg+xml')
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(match[2]);
  const base64 = match[2].replace(/\s/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error('画像データが不正です。');
  return `data:${match[1]};base64,${base64}`;
}
function normAssetPath(value: string) {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}
export function resolveAssetRef(store: SourceStore, ref: string): string {
  const raw = ref.startsWith('asset:') ? ref.slice(6) : ref;
  if (!raw) throw new Error('画像の参照が空です。');
  if (store.blocks.has(raw)) return raw;
  const prefixed = raw.startsWith('asset-') ? raw : `asset-${raw}`;
  if (store.blocks.has(prefixed)) return prefixed;
  const n = normAssetPath(raw),
    base = n.split('/').pop() || n;
  let found = '';
  for (const b of store.list('asset')) {
    const name = normAssetPath(b.name);
    if (name === n || name.endsWith('/' + n) || name === base || name.split('/').pop() === base) {
      if (found && found !== b.id) throw new Error(`画像の参照が複数に一致します: ${ref}`);
      found = b.id;
    }
  }
  if (found) return found;
  throw new Error(`埋め込み画像が見つかりません: ${ref}`);
}

export interface RenderContext {
  store: SourceStore;
  present: () => boolean;
  patchSource?: (from: number, to: number, replacement: string) => void;
  inspect: (id: string) => void;
  renderMarkdown?: (source: string) => string;
}
export interface Directive {
  name: string;
  attrs: Record<string, string>;
}
export function showError(el: HTMLElement, e: any) {
  el.classList.add('block-error');
  el.textContent = e.message || String(e);
}
export function mountImage(el: HTMLElement, attrs: Record<string, string>, ctx: RenderContext) {
  const id = resolveAssetRef(ctx.store, attrs.asset || '');
  const img = document.createElement('img');
  img.src = assetURL(ctx.store.get(id).text);
  img.alt = attrs.alt || ctx.store.get(id).name;
  img.className = 'embedded-image';
  el.classList.add('image-block');
  el.append(img);
  if (attrs.caption) {
    const c = document.createElement('p');
    c.className = 'image-caption';
    c.textContent = attrs.caption;
    el.append(c);
  }
  img.addEventListener('dblclick', () => {
    if (!ctx.present()) ctx.inspect(id);
  });
}
