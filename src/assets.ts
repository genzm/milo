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
