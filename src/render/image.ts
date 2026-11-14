import { assetURL, resolveAssetRef } from '../assets';
import type { RenderContext } from './context';

export function mountImage(el: HTMLElement, attrs: Record<string, string>, ctx: RenderContext) {
  const id = resolveAssetRef(ctx.store, attrs.asset || '');
  const img = document.createElement('img');
  img.src = assetURL(ctx.store.get(id).text);
  img.alt = attrs.alt || ctx.store.get(id).name;
  img.className = 'embedded-image';
  el.classList.add('image-block');
  el.append(img);
  if (attrs.caption) {
    const c = document.createElement('span');
    c.className = 'image-caption';
    if (ctx.renderInline) c.innerHTML = ctx.renderInline(attrs.caption);
    else c.textContent = attrs.caption;
    el.append(c);
  }
  img.addEventListener('dblclick', () => {
    if (!ctx.present()) ctx.inspect(id);
  });
}
