import { $, icon } from './shell';
import { esc, assetURL } from '../directives';
import { LAYOUTS, setSlideLayout, type SlideLayout } from '../slide-layout.mjs';
import type { Kind } from '../source';
import type { SourceEditor } from '../editor';
import type { EditorSession } from './session';
const langLabels: Partial<Record<Kind, string>> = {
  slide: 'MARKDOWN + TeX',
  asset: 'EMBEDDED ASSET',
  manifest: 'JSONC / DOCUMENT',
};
export function refreshInspector(
  session: EditorSession,
  sourceEditor: SourceEditor,
  actions: {
    mutate: (change: () => void) => boolean;
    chooseAsset: (id: string) => void;
    importAsset: (file: File, id: string) => Promise<void>;
    toast: (text: string) => void;
  },
) {
  const { mutate, chooseAsset, importAsset, toast } = actions;
  sourceEditor.destroy();
  if (
    !session.store.blocks.has(session.activeBlock) ||
    session.store.get(session.activeBlock).kind !== session.activeTab
  )
    session.activeBlock =
      session.activeTab === 'slide'
        ? session.currentId()
        : session.store.list(session.activeTab)[0]?.id || '';
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === session.activeTab);
    b.setAttribute('aria-selected', String(b.dataset.tab === session.activeTab));
  });
  const list = session.store.list(session.activeTab),
    select = $<HTMLSelectElement>('source-select');
  select.innerHTML = list
    .map((b, i) => {
      const label =
        b.kind === 'slide'
          ? `#${String(i + 1).padStart(2, '0')} — ${session.titleOf(b.id)}`
          : b.name;
      return `<option value="${esc(b.id)}">${esc(label)}${b.kind === 'slide' ? '' : ' · ' + esc(b.id)}</option>`;
    })
    .join('');
  select.value = session.activeBlock;
  $('source-kind').textContent = langLabels[session.activeTab] || '';
  $('add-source').hidden = session.activeTab === 'manifest';
  const extra = $('inspector-extra');
  extra.replaceChildren();
  $('source-editor').replaceChildren();
  if (!session.activeBlock) {
    $('source-editor').innerHTML = '<div class="empty-source">＋から新しく追加できます。</div>';
    return;
  }
  const b = session.store.get(session.activeBlock);
  if (session.activeTab === 'slide') {
    extra.innerHTML = `<div class="layout-control"><label>レイアウト <select id="layout-select"><option value="cover">表紙</option><option value="section">章扉</option><option value="lab">実験</option><option value="media">メディア</option><option value="essay">文章</option></select></label></div>`;
    $<HTMLSelectElement>('layout-select').value = session.layoutOf(b.id);
    $('layout-select').onchange = (e) =>
      mutate(() => {
        const layout = (e.target as HTMLSelectElement).value as SlideLayout;
        if (!LAYOUTS.includes(layout)) return;
        session.store.setText(b.id, setSlideLayout(session.store.get(b.id).text, layout));
      });
  }
  if (session.activeTab === 'asset') {
    let src = '';
    try {
      src = assetURL(b.text);
    } catch {}
    $('source-editor').innerHTML =
      `<div class="asset-panel"><div class="asset-preview">${src ? `<img src="${esc(src)}" alt="${esc(b.name)}">` : '読み込めない画像です。'}</div><strong>${esc(b.name)}</strong><p>${(b.text.length / 1024).toFixed(1)} KB · HTMLに埋め込み済み</p><button id="replace-asset" class="button">${icon('image')}画像を差し替える</button><button id="insert-asset" class="text-button">現在のスライドに挿入</button><p class="asset-reference">参照ID <code>${esc(b.id)}</code></p><p class="asset-drop-note">GIF・PNG・JPEG・WebP・SVG<br>このパネルにドロップしても差し替えできます。</p></div>`;
    $('replace-asset').onclick = () => chooseAsset(b.id);
    $('insert-asset').onclick = () => {
      const id = session.currentId();
      if (
        !mutate(() =>
          session.store.setText(
            id,
            session.store.get(id).text + `\n\n![画像](${b.name || 'asset:' + b.id})\n`,
          ),
        )
      )
        return;
      toast('現在のスライドに追加しました。');
    };
    const panel = $('source-editor');
    panel.ondragover = (e) => {
      e.preventDefault();
    };
    panel.ondrop = (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (file) void importAsset(file, b.id);
    };
    return;
  }
  $('source-editor').ondragover = null;
  $('source-editor').ondrop = null;
  sourceEditor.mount($('source-editor'), b, (text) => {
    mutate(() => session.store.setText(b.id, text));
  });
}
