import { basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
// Components are currently disabled; restore this import with their editor UI.
// import { javascript } from '@codemirror/lang-javascript';
import { json as jsonLanguage } from '@codemirror/lang-json';
import { SourceStore, json, normalize, type Block, type Kind } from './source';
import { Autosaver, readFile, type FileHandle } from './save';
import { validateModel, type Model } from './expression';
import { renderSlide, esc, fmt, assetURL, type Rendered } from './render';
import { cacheGet, cacheSet } from './cache';

interface Manifest {
  title: string;
  slides: string[];
  layouts?: Record<string, string>;
}
const SLIDE_WIDTH = 1600;
const SLIDE_HEIGHT = (SLIDE_WIDTH * 9) / 16;
document.documentElement.style.setProperty('--slide-width', `${SLIDE_WIDTH}px`);
document.documentElement.style.setProperty('--slide-height', `${SLIDE_HEIGHT}px`);
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const paths: Record<string, string> = {
  play: 'm8 5 11 7-11 7Z',
  code: 'm8 5-6 7 6 7m8-14 6 7-6 7m-5 2 2-18',
  plus: 'M12 5v14M5 12h14',
  left: 'm14 5-7 7 7 7',
  right: 'm10 5 7 7-7 7',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
  close: 'm6 6 12 12M6 18 18 6',
  file: 'M14 2H5v20h14V7Zm0 0v6h5M8 13h8M8 17h6',
  image: 'M3 3h18v18H3zM3 16l5-5 5 6 4-4 4 4M15 7h.01',
  copy: 'M8 8h12v13H8zM4 16H2V2h13v3',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  up: 'm5 14 7-7 7 7',
  down: 'm5 10 7 7 7-7',
};
const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.file}"/></svg>`;
const app = $('app');
let store = SourceStore.fromDOM(document),
  boot = store.snapshot(),
  opening = store.snapshot();
let current = 0,
  present = false,
  activeBlock = '',
  editor: EditorView | null = null,
  editorSync = false,
  rendered: Rendered | null = null;
let activeTab: Kind = 'slide',
  remembered: FileHandle | null = null,
  binding = false,
  renderTimer: ReturnType<typeof setTimeout> | null = null,
  cacheTimer: ReturnType<typeof setTimeout> | null = null;
// const componentState=new Map<string,any>(); // Components are currently disabled.
let manifest: Manifest = {
  title: 'milo',
  slides: store.list('slide').map((b) => b.id),
  layouts: {},
};
let manifestError = '';
const docId = document.querySelector('meta[name="milo-id"]')?.getAttribute('content') || 'milo';
const cacheKey = docId + '|' + location.href.split('#')[0];
const draftKey = 'draft:' + cacheKey,
  previousKey = 'previous:' + cacheKey,
  conflictKey = 'conflict:' + cacheKey;
type DraftBlock = Pick<Block, 'id' | 'kind' | 'name' | 'text'>;
interface Draft {
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
let openingFingerprint = blockFingerprint(opening.blocks);
const draftBlocks = () =>
  store.list().map(({ id, kind, name, text }) => ({ id, kind, name, text }));
async function persistDraft(reason: Draft['reason'] = 'edit'): Promise<Draft | null> {
  const blocks = draftBlocks(),
    draft: Draft = {
      version: 1,
      base: openingFingerprint,
      content: blockFingerprint(blocks),
      blocks,
      when: Date.now(),
      reason,
    };
  return (await cacheSet(draftKey, draft)) ? draft : null;
}
async function archiveDraft() {
  const draft = (await cacheGet(draftKey)) as Draft | undefined;
  if (
    !draft?.blocks?.length ||
    saver.state !== 'saved' ||
    saver.dirty() ||
    draft.content !== blockFingerprint(store.list())
  )
    return;
  if (await cacheSet(previousKey, { ...draft, reason: 'saved' } satisfies Draft))
    await cacheSet(draftKey, undefined);
}
async function preserveConflictDraft() {
  const draft = await persistDraft('conflict');
  if (!draft) return false;
  if (!(await cacheSet(conflictKey, draft))) return false;
  await cacheSet(draftKey, undefined);
  return true;
}
function readManifest() {
  try {
    const m = json<any>(store.get('manifest').text),
      slides = store.list('slide').map((b) => b.id);
    if (!m || typeof m.title !== 'string' || !slides.length)
      throw new Error('title と1枚以上のスライドを指定してください。');
    manifest = { title: m.title, slides, layouts: m.layouts };
    manifestError = '';
    current = Math.max(0, Math.min(current, slides.length - 1));
  } catch (e: any) {
    manifestError = e.message;
    manifest.slides = store.list('slide').map((b) => b.id);
    current = Math.max(0, Math.min(current, manifest.slides.length - 1));
  }
}
function currentId() {
  return manifest.slides[current] || store.list('slide')[0]?.id;
}
function titleOf(id: string) {
  return store.blocks.get(id)?.text.match(/^#\s+(.+)$/m)?.[1] || store.blocks.get(id)?.name || id;
}
function sourceChanged() {
  return (
    store.list().length !== opening.blocks.length ||
    opening.blocks.some(
      (b) => !store.blocks.has(b.id) || normalize(store.get(b.id).text) !== normalize(b.text),
    )
  );
}
const saver = new Autosaver(
  () => store.html,
  () => {
    updateSave();
    if (saver.state === 'saved' && !saver.dirty()) void archiveDraft();
    else if (['conflict', 'permission', 'error'].includes(saver.state))
      void persistDraft(saver.state === 'conflict' ? 'conflict' : 'edit');
  },
);

app.innerHTML = `
<header class="app-header">
  <div class="brand"><span>milo</span></div>
  <div class="document-name"><span class="document-dot"></span><span id="document-title"></span></div>
  <div class="header-actions"><button id="save-state" class="save-state" title="保存の状態"><span class="status-dot"></span><span id="save-label"></span></button><button id="connect" class="button primary">${icon('link')}<span>自動保存を接続</span></button><button id="present" class="button">${icon('play')}<span>発表する</span></button></div>
</header>
<div id="save-notice" class="save-notice" hidden><span id="save-notice-text"></span><button id="resolve-save" class="text-button"></button></div>
<div class="workspace">
  <aside class="sidebar" aria-label="スライド一覧"><div class="sidebar-heading"><span id="slide-count"></span></div><nav id="slides"></nav><div class="slide-operations"><button id="move-up" class="icon-button" title="前へ移動" aria-label="スライドを前へ移動">${icon('up')}</button><button id="move-down" class="icon-button" title="後ろへ移動" aria-label="スライドを後ろへ移動">${icon('down')}</button><button id="duplicate" class="icon-button" title="複製" aria-label="スライドを複製">${icon('copy')}</button><button id="remove-slide" class="icon-button" title="削除" aria-label="スライドを削除">${icon('trash')}</button></div><button id="add-slide" class="add-slide">${icon('plus')}スライドを追加</button></aside>
  <main class="main-stage"><div class="stage-topline"><div class="stage-tools"><button id="diff" class="text-button">変更を見る <span id="change-count"></span></button></div></div>
    <div class="stage-scroll" id="stage-scroll"><div class="slide-viewport" id="slide-viewport"><article class="slide" id="slide"><div class="slide-top"><span class="slide-series" id="slide-series"></span></div><div id="slide-content" class="slide-content"></div></article></div></div>
    <div class="stage-bottom"><nav class="pagination" aria-label="ページ送り"><button id="previous" class="icon-button" aria-label="前のスライド">${icon('left')}</button><span id="page-number"></span><button id="next" class="icon-button" aria-label="次のスライド">${icon('right')}</button></nav></div>
  </main>
  <aside class="inspector" aria-label="原稿とモデルの編集"><div class="inspector-tabs" role="tablist"><button data-tab="slide" role="tab">原稿</button><button data-tab="model" role="tab">モデル</button><!-- Components disabled: <button data-tab="component" role="tab">部品</button> --><button data-tab="asset" role="tab">素材</button><button data-tab="manifest" role="tab">設定</button></div>
    <div class="inspector-heading"><div class="source-select"><select id="source-select" aria-label="編集するソース"></select><button id="add-source" class="icon-button" aria-label="ソースを追加">${icon('plus')}</button></div></div><div id="inspector-extra"></div><div id="source-editor" class="source-editor"></div><div class="inspector-footer"><span id="source-kind"></span><span>変更は自動で反映</span></div>
  </aside>
</div><div id="toast" class="toast" role="status" hidden></div><input type="file" id="asset-input" accept="image/gif,image/png,image/jpeg,image/webp,image/svg+xml" hidden><dialog id="dialog"><div class="dialog-top"><h2 id="dialog-title"></h2><button id="dialog-close" class="icon-button" aria-label="閉じる">${icon('close')}</button></div><div id="dialog-content"></div></dialog>`;

function toast(text: string) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  setTimeout(() => (el.hidden = true), 4500);
}
function dialog(title: string, html: string) {
  $('dialog-title').textContent = title;
  $('dialog-content').innerHTML = html;
  const el = $<HTMLDialogElement>('dialog');
  if (!el.open) el.showModal();
}
$('dialog-close').onclick = () => $<HTMLDialogElement>('dialog').close();
$('dialog').addEventListener('click', (e) => {
  if (e.target === $('dialog')) $<HTMLDialogElement>('dialog').close();
});
function updateSave() {
  const state = saver.state;
  let label = '自動保存 未接続';
  if (state === 'saved') label = '保存済み';
  else if (state === 'saving') label = '保存中…';
  else if (state === 'pending') label = '未保存の変更';
  else if (state === 'conflict') label = '外部変更で停止';
  else if (state === 'permission') label = '許可が必要';
  else if (state === 'error') label = '保存できません';
  else if (sourceChanged()) label = '未接続 · 未保存';
  $('save-label').textContent = label;
  $('save-state').dataset.state = state;
  $('save-state').title = saver.handle ? `${saver.handle.name} · ${label}` : label;
  $('connect').hidden = !!saver.handle;
  $<HTMLButtonElement>('connect').disabled = binding;
  $('connect').querySelector('span')!.textContent = binding
    ? '接続中…'
    : remembered
      ? '自動保存を再接続'
      : '自動保存を接続';
  const blocked = ['conflict', 'error', 'permission'].includes(state);
  $('save-notice').hidden = !blocked;
  if (blocked) {
    $('save-notice-text').textContent = saver.message;
    $('resolve-save').textContent =
      state === 'conflict'
        ? 'ファイルを読み直す'
        : state === 'permission'
          ? '許可して再開'
          : '再試行';
  }
}
function updateNav() {
  readManifest();
  document.title = manifest.title + ' — milo';
  $('document-title').textContent = manifest.title;
  $('slide-count').textContent = String(manifest.slides.length).padStart(2, '0');
  $('slides').innerHTML = manifest.slides
    .map((id, i) => {
      const text = store.get(id).text,
        kind =
          /!\[[^\]]*]\([^)]+\)/.test(text) || text.includes('::image')
            ? 'image'
            : text.includes('::plot')
              ? 'plot'
              : 'text',
        layout = manifest.layouts?.[id] || 'lab';
      const art =
        kind === 'plot'
          ? '<svg viewBox="0 0 140 36"><path d="M0 18H140M0 32V3" class="thumb-axis"/><path d="M0 4C10 4 10 34 20 30S30 9 40 11 50 26 60 25 70 13 80 15 90 23 100 22 110 16 120 17 130 20 140 19"/></svg>'
          : kind === 'image'
            ? '<div class="thumb-image">GIF <span>↗</span></div>'
            : '<div class="thumb-lines"><i></i><i></i><i></i></div>';
      return `<button class="slide-thumb ${i === current ? 'active' : ''}" data-index="${i}" aria-label="スライド ${i + 1}: ${esc(titleOf(id))}" ${i === current ? 'aria-current="page"' : ''}><span class="thumb-number">${String(i + 1).padStart(2, '0')}</span><span class="thumb-paper thumb-${esc(layout)}"><strong>${esc(titleOf(id))}</strong>${art}</span></button>`;
    })
    .join('');
  $('slides')
    .querySelectorAll<HTMLButtonElement>('button')
    .forEach((b) => (b.onclick = () => go(Number(b.dataset.index))));
  $('page-number').textContent = current === 0 ? '' : `${current + 1} / ${manifest.slides.length}`;
  $<HTMLButtonElement>('previous').disabled = current <= 0;
  $<HTMLButtonElement>('next').disabled = current >= manifest.slides.length - 1;
  $<HTMLButtonElement>('move-up').disabled = current <= 0;
  $<HTMLButtonElement>('move-down').disabled = current >= manifest.slides.length - 1;
  $<HTMLButtonElement>('remove-slide').disabled = manifest.slides.length <= 1;
  const changed =
    store.list().filter((b) => opening.blocks.find((o) => o.id === b.id)?.text !== b.text).length +
    opening.blocks.filter((b) => !store.blocks.has(b.id)).length;
  $('change-count').textContent = changed ? String(changed) : '';
}
function parameters(id: string, m: Model) {
  return m.parameters;
}
function refreshSlide() {
  if (renderTimer) {
    clearTimeout(renderTimer);
    renderTimer = null;
  }
  rendered?.dispose();
  readManifest();
  const id = currentId();
  if (!id) return;
  $('slide').className =
    'slide layout-' +
    (['cover', 'section', 'lab', 'media', 'essay'].includes(manifest.layouts?.[id] || '')
      ? manifest.layouts![id]
      : 'lab');
  $('slide-series').textContent =
    current === 0
      ? ''
      : String(current + 1).padStart(2, '0') +
        ' / ' +
        String(manifest.slides.length).padStart(2, '0');
  try {
    rendered = renderSlide($('slide-content'), store.get(id).text, {
      store,
      present: () => present,
      parameters,
      setParameter,
      inspect: selectBlock,
    });
  } catch (e: any) {
    $('slide-content').innerHTML = `<div class="block-error">${esc(e.message)}</div>`;
  }
  if (manifestError) {
    const el = document.createElement('div');
    el.className = 'manifest-error';
    el.textContent = '文書設定のエラー: ' + manifestError;
    $('slide-content').prepend(el);
  }
}
function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(refreshSlide, 220);
}
function scheduleCache() {
  if (cacheTimer) clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    cacheTimer = null;
    if (saver.handle && !saver.dirty()) void archiveDraft();
    else if (!saver.handle && !sourceChanged()) void cacheSet(draftKey, undefined);
    else void persistDraft();
  }, 150);
}
function afterChange(kind: 'source' | 'parameter' | 'structure' = 'source') {
  updateNav();
  updateSave();
  syncEditor();
  if (kind === 'parameter') rendered?.update();
  else scheduleRender();
  saver.schedule();
  scheduleCache();
}
function mutate(fn: () => void, kind: 'source' | 'parameter' | 'structure' = 'source') {
  const before = store.snapshot(),
    revision = store.revision;
  try {
    fn();
    if (store.revision === revision) return;
    afterChange(kind);
  } catch (e: any) {
    store.restore(before);
    toast(e.message);
  }
}
function setParameter(id: string, key: string, value: number) {
  if (!Number.isFinite(value)) return;
  try {
    const m = validateModel(json(store.get(id).text));
    if (!Object.hasOwn(m.parameters, key)) throw new Error(`係数がありません: ${key}`);
    mutate(() => store.setJSON(id, ['parameters', key], value), 'parameter');
  } catch (e: any) {
    toast(e.message);
  }
}
function syncEditor() {
  if (!editor || !store.blocks.has(activeBlock)) return;
  const next = normalize(store.get(activeBlock).text),
    old = editor.state.doc.toString();
  if (next === old) return;
  let a = 0;
  while (a < old.length && a < next.length && old[a] === next[a]) a++;
  let z = old.length,
    n = next.length;
  while (z > a && n > a && old[z - 1] === next[n - 1]) {
    z--;
    n--;
  }
  editorSync = true;
  editor.dispatch({ changes: { from: a, to: z, insert: next.slice(a, n) } });
  editorSync = false;
}
function selectBlock(id: string) {
  if (!store.blocks.has(id)) return;
  activeBlock = id;
  activeTab = store.get(id).kind;
  refreshInspector();
}
const langLabels: Partial<Record<Kind, string>> = {
  slide: 'MARKDOWN + TeX',
  model: 'JSONC / MODEL',
  asset: 'EMBEDDED ASSET',
  manifest: 'JSONC / DOCUMENT',
  // component:'JAVASCRIPT / WORKER'
};
function refreshInspector() {
  editor?.destroy();
  editor = null;
  if (!store.blocks.has(activeBlock) || store.get(activeBlock).kind !== activeTab)
    activeBlock = activeTab === 'slide' ? currentId() : store.list(activeTab)[0]?.id || '';
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === activeTab);
    b.setAttribute('aria-selected', String(b.dataset.tab === activeTab));
  });
  const list = store.list(activeTab),
    select = $<HTMLSelectElement>('source-select');
  select.innerHTML = list
    .map((b, i) => {
      const label =
        b.kind === 'slide' ? `#${String(i + 1).padStart(2, '0')} — ${titleOf(b.id)}` : b.name;
      return `<option value="${esc(b.id)}">${esc(label)}${b.kind === 'slide' ? '' : ' · ' + esc(b.id)}</option>`;
    })
    .join('');
  select.value = activeBlock;
  $('source-kind').textContent = langLabels[activeTab] || '';
  $('add-source').hidden = activeTab === 'manifest';
  const extra = $('inspector-extra');
  extra.replaceChildren();
  $('source-editor').replaceChildren();
  if (!activeBlock) {
    $('source-editor').innerHTML = '<div class="empty-source">＋から新しく追加できます。</div>';
    return;
  }
  const b = store.get(activeBlock);
  if (activeTab === 'slide') {
    extra.innerHTML = `<div class="layout-control"><label>レイアウト <select id="layout-select"><option value="cover">表紙</option><option value="section">章扉</option><option value="lab">実験</option><option value="media">メディア</option><option value="essay">文章</option></select></label></div>`;
    $<HTMLSelectElement>('layout-select').value = manifest.layouts?.[b.id] || 'lab';
    $('layout-select').onchange = (e) =>
      mutate(() =>
        store.setJSON('manifest', ['layouts', b.id], (e.target as HTMLSelectElement).value),
      );
  }
  if (activeTab === 'asset') {
    let src = '';
    try {
      src = assetURL(b.text);
    } catch {}
    $('source-editor').innerHTML =
      `<div class="asset-panel"><div class="asset-preview">${src ? `<img src="${esc(src)}" alt="${esc(b.name)}">` : '読み込めない画像です。'}</div><strong>${esc(b.name)}</strong><p>${(b.text.length / 1024).toFixed(1)} KB · HTMLに埋め込み済み</p><button id="replace-asset" class="button">${icon('image')}画像を差し替える</button><button id="insert-asset" class="text-button">現在のスライドに挿入</button><p class="asset-reference">参照ID <code>${esc(b.id)}</code></p><p class="asset-drop-note">GIF・PNG・JPEG・WebP・SVG<br>このパネルにドロップしても差し替えできます。</p></div>`;
    $('replace-asset').onclick = () => chooseAsset(b.id);
    $('insert-asset').onclick = () => {
      const id = currentId();
      mutate(() =>
        store.setText(id, store.get(id).text + `\n\n![画像](${b.name || 'asset:' + b.id})\n`),
      );
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
  const lang = activeTab === 'slide' ? markdown() : jsonLanguage();
  const state = EditorState.create({
    doc: b.text,
    extensions: [
      basicSetup,
      lang,
      keymap.of([indentWithTab]),
      EditorView.lineWrapping,
      EditorState.lineSeparator.of(b.text.includes('\r\n') ? '\r\n' : '\n'),
      EditorView.contentAttributes.of({ 'aria-label': b.name + ' のソース' }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !editorSync) {
          const id = activeBlock,
            next = update.state.sliceDoc();
          mutate(() => store.setText(id, next));
        }
      }),
    ],
  });
  editor = new EditorView({ state, parent: $('source-editor') });
}
function go(index: number) {
  current = Math.max(0, Math.min(index, manifest.slides.length - 1));
  updateNav();
  refreshSlide();
  if (activeTab === 'slide') {
    activeBlock = currentId();
    refreshInspector();
  }
}
function setPresent(value: boolean) {
  present = value;
  document.body.classList.toggle('presenting', value);
  $('present').innerHTML =
    icon(value ? 'code' : 'play') + `<span>${value ? '編集に戻る' : '発表する'}</span>`;
  scaleSlide();
  requestAnimationFrame(scaleSlide);
}

function scaleSlide() {
  const stage = $('stage-scroll'),
    viewport = $('slide-viewport'),
    slide = $('slide'),
    availableWidth = stage.clientWidth,
    availableHeight = stage.clientHeight;
  if (availableWidth <= 0) return;
  const fitWidth = availableWidth / SLIDE_WIDTH,
    fitHeight = availableHeight > 0 ? availableHeight / SLIDE_HEIGHT : fitWidth,
    scale = Math.max(0.05, Math.min(present ? Infinity : 1, fitWidth, fitHeight));
  viewport.style.width = `${SLIDE_WIDTH * scale}px`;
  viewport.style.height = `${SLIDE_HEIGHT * scale}px`;
  slide.style.transform = `scale(${scale})`;
  slide.dataset.scale = String(scale);
}
function unique(prefix: string) {
  return prefix + '-' + crypto.randomUUID().slice(0, 8);
}
function addSlide(duplicate = false) {
  const id = unique('slide'),
    old = currentId(),
    before = manifest.slides[current + 1] || null;
  mutate(() => {
    store.add(
      {
        id,
        kind: 'slide',
        name: id + '.md',
        text: duplicate ? store.get(old).text : '# 新しい問い\n\nここから、考えを続ける。\n',
      },
      before,
    );
    store.setJSON(
      'manifest',
      ['layouts', id],
      duplicate ? manifest.layouts?.[old] || 'lab' : 'essay',
    );
  }, 'structure');
  current = manifest.slides.indexOf(id);
  activeTab = 'slide';
  activeBlock = id;
  go(current);
}
function moveSlide(delta: number) {
  const ids = [...manifest.slides],
    to = current + delta;
  if (to < 0 || to >= ids.length) return;
  [ids[current], ids[to]] = [ids[to], ids[current]];
  const id = ids[to],
    before = ids[to + 1] || null;
  mutate(() => store.moveBefore(id, before), 'structure');
  current = to;
  go(to);
}
function removeSlide() {
  if (manifest.slides.length <= 1) return;
  if (!confirm('このスライドを削除しますか？この操作は取り消せません。')) return;
  const id = currentId();
  mutate(() => {
    store.setJSON('manifest', ['layouts', id], undefined);
    store.remove(id);
  }, 'structure');
  activeBlock = currentId();
  go(current);
}
async function connect(useRemembered = true) {
  if (binding) return;
  try {
    if (!remembered || !useRemembered) {
      if (!('showOpenFilePicker' in window))
        throw new Error(
          'ダウンロードしたHTMLをデスクトップ版ChromeまたはEdgeで開いて接続してください。',
        );
    }
    binding = true;
    updateSave();
    // Open the picker directly inside the user's gesture, before file reading.
    const handle: FileHandle =
      remembered && useRemembered
        ? remembered
        : (
            await (window as any).showOpenFilePicker({
              multiple: false,
              types: [{ description: 'milo HTML', accept: { 'text/html': ['.html'] } }],
            })
          )[0];
    if (
      handle.requestPermission &&
      (await handle.requestPermission({ mode: 'readwrite' })) !== 'granted'
    )
      throw new Error('書き込み許可が必要です。編集内容は画面に残っています。');
    await bindHandle(handle);
    toast(`${handle.name} に接続しました。以後は自動保存します。`);
  } catch (e: any) {
    if (e.name !== 'AbortError') {
      if (
        remembered &&
        (e.name === 'NotFoundError' || String(e.message).includes('内容が異なります'))
      ) {
        remembered = null;
        void cacheSet('handle:' + cacheKey, undefined);
      }
      toast(
        e.name === 'SecurityError'
          ? 'このプレビューからは接続できません。HTMLをダウンロードし、ChromeまたはEdgeで開いてください。'
          : e.message,
      );
    }
  } finally {
    binding = false;
    updateSave();
  }
}
async function bindHandle(handle: FileHandle) {
  const original = await readFile(handle),
    disk = SourceStore.fromHTML(original);
  store.attach(disk, boot);
  remembered = handle;
  saver.bind(handle, original);
  await cacheSet('handle:' + cacheKey, handle);
  syncEditor();
  updateNav();
  refreshSlide();
}
async function resolveSave() {
  if (saver.state === 'conflict') {
    if (
      !confirm(
        'ファイルの内容を読み直します。画面の未保存の変更は置き換わります。必要な原稿は先にコピーしてください。',
      )
    )
      return;
    try {
      if (!(await preserveConflictDraft())) {
        toast('未保存の編集をブラウザに退避できないため、読み直しを中止しました。');
        return;
      }
      const text = await readFile(saver.handle!);
      const disk = SourceStore.fromHTML(text);
      store.restore(disk.snapshot());
      boot = store.snapshot();
      opening = store.snapshot();
      openingFingerprint = blockFingerprint(opening.blocks);
      saver.bind(saver.handle!, text);
      updateNav();
      activeBlock = currentId();
      refreshInspector();
      refreshSlide();
      toast('外部の内容を読み込みました。未保存の編集はブラウザに退避しています。');
    } catch (e: any) {
      toast(e.message);
    }
    return;
  }
  try {
    if (
      saver.state === 'permission' &&
      saver.handle?.requestPermission &&
      (await saver.handle.requestPermission({ mode: 'readwrite' })) !== 'granted'
    )
      return;
    await saver.retry();
  } catch (e: any) {
    toast(e.message);
  }
}
function showDiff() {
  const ids = new Set([...opening.blocks.map((b) => b.id), ...store.blocks.keys()]);
  let html = '';
  for (const id of ids) {
    const old = opening.blocks.find((b) => b.id === id),
      b = store.blocks.get(id);
    if (old?.text === b?.text) continue;
    if ((b || old)?.kind === 'asset') {
      html += `<section class="diff-section"><h3>${esc(id)}</h3><p>画像素材を${!old ? '追加' : !b ? '削除' : '変更'}しました。</p></section>`;
      continue;
    }
    const a = (old?.text || '').split('\n'),
      z = (b?.text || '').split('\n');
    let start = 0;
    while (start < a.length && start < z.length && a[start] === z[start]) start++;
    let ae = a.length,
      ze = z.length;
    while (ae > start && ze > start && a[ae - 1] === z[ze - 1]) {
      ae--;
      ze--;
    }
    const lines = [
      ...a.slice(Math.max(0, start - 2), start).map((t) => [' ', t]),
      ...a.slice(start, ae).map((t) => ['−', t]),
      ...z.slice(start, ze).map((t) => ['+', t]),
      ...a.slice(ae, ae + 2).map((t) => [' ', t]),
    ];
    html += `<section class="diff-section"><h3>${esc(id)}</h3><pre>${lines.map(([sign, t]) => `<span class="${sign === '+' ? 'diff-add' : sign === '−' ? 'diff-remove' : ''}">${sign} ${esc(t)}\n</span>`).join('')}</pre></section>`;
  }
  dialog(
    '開いたときからの変更',
    `<p class="dialog-note">このセッションで変更した原稿を表示します。自動保存後も比較できます。</p>${html || '<div class="empty-diff">まだ変更はありません。</div>'}`,
  );
}
let replaceAssetId: string | null = null;
function chooseAsset(id: string | null = null) {
  replaceAssetId = id;
  $<HTMLInputElement>('asset-input').value = '';
  $<HTMLInputElement>('asset-input').click();
}
async function importAsset(file: File, replaceId: string | null) {
  try {
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
    const id = replaceId || unique('asset');
    mutate(() => {
      if (replaceId) store.setText(id, content);
      else store.add({ id, kind: 'asset', name: file.name, text: content });
    }, 'structure');
    selectBlock(id);
    toast('画像をHTMLに埋め込みました。');
  } catch (e: any) {
    toast(e.message);
  }
}
$('asset-input').onchange = (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) void importAsset(file, replaceAssetId);
};
$('add-source').onclick = () => {
  if (activeTab === 'slide') {
    addSlide();
    return;
  }
  if (activeTab === 'asset') {
    chooseAsset();
    return;
  }
  // Component source creation is disabled with the component tab.
  if (activeTab === 'model') {
    const kind = activeTab,
      id = unique(kind);
    const text =
      '{\n  "input": "t",\n  "parameters": {\n    "a": 1\n  },\n  "expression": "a * sin(t)"\n}';
    mutate(() => store.add({ id, kind, name: id + '.jsonc', text }), 'structure');
    selectBlock(id);
  }
};
$('source-select').onchange = (e) => selectBlock((e.target as HTMLSelectElement).value);
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(
  (b) =>
    (b.onclick = () => {
      activeTab = b.dataset.tab as Kind;
      activeBlock = activeTab === 'slide' ? currentId() : store.list(activeTab)[0]?.id || '';
      refreshInspector();
    }),
);
$('connect').onclick = () => void connect();
$('present').onclick = () => setPresent(!present);
$('previous').onclick = () => go(current - 1);
$('next').onclick = () => go(current + 1);
$('add-slide').onclick = () => addSlide();
$('duplicate').onclick = () => addSlide(true);
$('remove-slide').onclick = removeSlide;
$('move-up').onclick = () => moveSlide(-1);
$('move-down').onclick = () => moveSlide(1);
$('diff').onclick = showDiff;
$('resolve-save').onclick = () => void resolveSave();
$('save-state').onclick = () => {
  if (!saver.handle) {
    toast('「自動保存を接続」で、書き込み先のHTMLを選んでください。');
  } else if (['error', 'conflict', 'permission'].includes(saver.state)) {
    toast(saver.message);
  } else toast(`${saver.handle.name} に自動保存しています。`);
};
async function saveNow() {
  if (binding) return;
  if (!saver.handle) {
    await connect();
    return;
  }
  if (saver.state === 'conflict') {
    toast(saver.message);
    return;
  }
  if (saver.state === 'permission' || saver.state === 'error') {
    await resolveSave();
    return;
  }
  await saver.flush();
  if (saver.state === 'saved') toast(`${saver.handle.name} に保存しました。`);
  else if (saver.message) toast(saver.message);
}
document.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 's' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    if (!e.repeat) void saveNow();
    return;
  }
  if ($<HTMLDialogElement>('dialog').open) return;
  const target = e.target as HTMLElement;
  if (target.closest('input,textarea,select,.cm-editor,[contenteditable="true"]')) return;
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    go(current + 1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    go(current - 1);
  } else if (e.key === 'Escape' && present) setPresent(false);
  else if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey) setPresent(!present);
});
window.addEventListener('beforeunload', (e) => {
  if ((saver.handle && saver.dirty()) || (!saver.handle && sourceChanged())) {
    e.preventDefault();
    e.returnValue = '';
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (cacheTimer) {
      clearTimeout(cacheTimer);
      cacheTimer = null;
    }
    if ((saver.handle && saver.dirty()) || (!saver.handle && sourceChanged()))
      void persistDraft('hidden');
    void saver.flush();
  }
});
async function restoreLocal() {
  const active = (await cacheGet(draftKey)) as Draft | undefined,
    conflict = (await cacheGet(conflictKey)) as Draft | undefined;
  const draft = active?.blocks?.length ? active : conflict?.blocks?.length ? conflict : undefined,
    draftStorageKey = active?.blocks?.length ? draftKey : conflictKey;
  remembered = (await cacheGet('handle:' + cacheKey)) || null;
  updateSave();
  if (
    draft?.blocks?.length &&
    JSON.stringify(draft.blocks.map((b: Block) => [b.id, b.text])) !==
      JSON.stringify(store.list().map((b) => [b.id, b.text]))
  ) {
    const changedBase = draft.base && draft.base !== blockFingerprint(store.list());
    dialog(
      '未保存の編集が残っています',
      `<p>${changedBase ? '退避後にHTML側も変更されています。内容を確認してから復元してください。' : '前回このブラウザに退避された原稿があります。復元すると、現在の原稿にその編集を戻します。'}</p><div class="dialog-actions"><button class="button" id="discard-draft">現在のHTMLを使う</button><button class="button primary" id="restore-draft">編集を復元</button></div>`,
    );
    $('discard-draft').onclick = () => {
      void cacheSet(draftStorageKey, undefined);
      $<HTMLDialogElement>('dialog').close();
      void tryResume();
    };
    $('restore-draft').onclick = () => {
      void cacheSet(draftStorageKey, undefined);
      mutate(() => {
        const ids = new Set(draft.blocks.map((b: Block) => b.id));
        for (const b of draft.blocks) {
          if (store.blocks.has(b.id)) store.setText(b.id, b.text);
          else store.add(b);
        }
        for (const b of store.list()) if (!ids.has(b.id) && b.id !== 'manifest') store.remove(b.id);
        let before: string | null = null;
        for (const id of draft.blocks
          .filter((b: Block) => b.kind === 'slide')
          .map((b: Block) => b.id)
          .reverse()) {
          store.moveBefore(id, before);
          before = id;
        }
      }, 'structure');
      refreshInspector();
      $<HTMLDialogElement>('dialog').close();
      void tryResume();
    };
    return;
  }
  if (active?.blocks?.length) void cacheSet(draftKey, undefined);
  await tryResume();
}
async function tryResume() {
  try {
    if (
      remembered?.queryPermission &&
      (await remembered.queryPermission({ mode: 'readwrite' })) === 'granted'
    )
      await bindHandle(remembered);
  } catch {
    /* Never write if the remembered file differs from the open document. */
  }
  updateSave();
}
readManifest();
updateNav();
activeBlock = currentId();
refreshInspector();
refreshSlide();
const slideResizeObserver =
  typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scaleSlide);
slideResizeObserver?.observe($('stage-scroll'));
window.addEventListener('resize', scaleSlide);
scaleSlide();
updateSave();
void restoreLocal();
