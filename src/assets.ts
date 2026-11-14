import { SourceStore } from './source';

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
  if (store.blocks.get(raw)?.kind === 'asset') return raw;
  const prefixed = raw.startsWith('asset-') ? raw : `asset-${raw}`;
  if (store.blocks.get(prefixed)?.kind === 'asset') return prefixed;
  const n = normAssetPath(raw),
    base = n.split('/').pop() || n;
  const assets = store.list('asset');
  const exact = assets.filter((b) => normAssetPath(b.name) === n);
  const matches = exact.length
    ? exact
    : assets.filter((b) => {
        const name = normAssetPath(b.name);
        return name.endsWith('/' + n) || name.split('/').pop() === base;
      });
  if (matches.length > 1) throw new Error(`画像の参照が複数に一致します: ${ref}`);
  if (matches.length === 1) return matches[0].id;
  throw new Error(`埋め込み画像が見つかりません: ${ref}`);
}

export async function readImageAsset(file: File): Promise<string> {
  if (file.size > 12 * 1024 * 1024) throw new Error('初版では12MB以下の画像を使ってください。');
  const allowed = ['image/gif', 'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
  let mime = file.type;
  if (!mime && /\.svg$/i.test(file.name)) mime = 'image/svg+xml';
  if (!allowed.includes(mime)) throw new Error('GIF・PNG・JPEG・WebP・SVGを選んでください。');
  let content: string;
  if (mime === 'image/svg+xml') {
    const text = await file.text(),
      doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg')
      throw new Error('SVGを読み込めませんでした。');
    if (
      doc.querySelector('script,foreignObject') ||
      /@import|url\s*\(\s*['"]?(?!#)/i.test(text) ||
      [...doc.querySelectorAll('*')].some((el) =>
        [...el.attributes].some(
          (a) =>
            /^on/i.test(a.name) ||
            (/(?:^|:)href$/i.test(a.name) && a.value && !a.value.startsWith('#')),
        ),
      )
    )
      throw new Error('SVGは外部参照やスクリプトを含まない画像を使ってください。');
    content = `mime: ${mime}\n\n${text}`;
  } else {
    const uri = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('画像を読み込めませんでした。'));
      img.src = uri;
    });
    content = `mime: ${mime}\n\n${uri
      .split(',')[1]
      .match(/.{1,76}/g)!
      .join('\n')}`;
  }
  return content;
}
