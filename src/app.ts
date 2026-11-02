import { $, icon, appMarkup } from './app/shell';
import { EditorSession } from './app/session';
import { EditUpdates } from './app/updates';
import { updateNavigation } from './app/navigation';
import { refreshInspector as renderInspector } from './app/inspector';
import slideSize from './slide-size.json';
import { slideNumber } from './slide-frame';
import { SourceStore, type Kind } from './source';
import { Autosaver, readFile, type FileHandle } from './save';
import { renderSlide, esc, type Rendered } from './render';
import { cacheGet, cacheSet } from './cache';
import { DraftStore } from './drafts';
import { SourceEditor } from './editor';
import { readImageAsset } from './assets';

const { width: SLIDE_WIDTH, height: SLIDE_HEIGHT } = slideSize;
document.documentElement.style.setProperty('--slide-width', `${SLIDE_WIDTH}px`);
document.documentElement.style.setProperty('--slide-height', `${SLIDE_HEIGHT}px`);
const app = $('app');
const sourceEditor = new SourceEditor();
const session = new EditorSession(SourceStore.fromDOM(document));
let present = false,
  rendered: Rendered | null = null,
  remembered: FileHandle | null = null,
  binding = false;
const docId = document.querySelector('meta[name="milo-id"]')?.getAttribute('content') || 'milo';
const cacheKey = docId + '|' + location.href.split('#')[0];
const drafts = new DraftStore(cacheKey, session.store, session.opening.blocks);
const saver = new Autosaver(
  () => session.store.html,
  () => {
    updateSave();
    if (saver.state === 'saved' && !saver.dirty()) void drafts.archive(saver);
    else if (['conflict', 'permission', 'error'].includes(saver.state))
      void drafts.persist(saver.state === 'conflict' ? 'conflict' : 'edit');
  },
);

app.innerHTML = appMarkup;

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
  else if (session.sourceChanged()) label = '未接続 · 未保存';
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
  updateNavigation(session, go);
}
function refreshSlide() {
  updates.cancelRender();
  rendered?.dispose();
  session.readManifest();
  const id = session.currentId();
  if (!id) return;
  $('slide').className = 'slide layout-' + session.layoutOf(id);
  $('slide-series').textContent = slideNumber(session.current, session.manifest.slides.length);
  try {
    rendered = renderSlide($('slide-content'), session.store.get(id).text, {
      store: session.store,
      present: () => present,
      patchSource: (from, to, replacement) =>
        mutate(() => {
          const text = session.store.get(id).text;
          if (from < 0 || to < from || to > text.length) return;
          session.store.setText(id, text.slice(0, from) + replacement + text.slice(to));
        }),
      inspect: selectBlock,
    });
  } catch (e: any) {
    $('slide-content').innerHTML = `<div class="block-error">${esc(e.message)}</div>`;
  }
  if (session.manifestError) {
    const el = document.createElement('div');
    el.className = 'manifest-error';
    el.textContent = '文書設定のエラー: ' + session.manifestError;
    $('slide-content').prepend(el);
  }
}
const updates = new EditUpdates({
  navigation: updateNav,
  saveState: updateSave,
  editor: syncEditor,
  render: refreshSlide,
  save: () => saver.schedule(),
  cache: () => {
    if (saver.handle && !saver.dirty()) void drafts.archive(saver);
    else if (!saver.handle && !session.sourceChanged()) void drafts.discard();
    else void drafts.persist();
  },
});
function mutate(fn: () => void): boolean {
  try {
    if (session.mutate(fn)) updates.changed();
    return true;
  } catch (e: any) {
    toast(e.message);
    return false;
  }
}
function syncEditor() {
  if (session.store.blocks.has(session.activeBlock))
    sourceEditor.sync(session.store.get(session.activeBlock).text);
}
function selectBlock(id: string) {
  if (!session.store.blocks.has(id)) return;
  session.activeBlock = id;
  session.activeTab = session.store.get(id).kind;
  refreshInspector();
}
function refreshInspector() {
  renderInspector(session, sourceEditor, { mutate, chooseAsset, importAsset, toast });
}

function go(index: number) {
  session.current = Math.max(0, Math.min(index, session.manifest.slides.length - 1));
  updateNav();
  refreshSlide();
  if (session.activeTab === 'slide') {
    session.activeBlock = session.currentId();
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
    stageStyle = getComputedStyle(stage),
    horizontalPadding =
      (Number.parseFloat(stageStyle.paddingLeft) || 0) +
      (Number.parseFloat(stageStyle.paddingRight) || 0),
    verticalPadding =
      (Number.parseFloat(stageStyle.paddingTop) || 0) +
      (Number.parseFloat(stageStyle.paddingBottom) || 0),
    availableWidth = Math.max(0, stage.clientWidth - horizontalPadding),
    availableHeight = Math.max(0, stage.clientHeight - verticalPadding);
  if (availableWidth <= 0) return;
  const fitWidth = availableWidth / SLIDE_WIDTH,
    fitHeight = availableHeight > 0 ? availableHeight / SLIDE_HEIGHT : fitWidth,
    scale = Math.max(0.05, Math.min(present ? Infinity : 1, fitWidth, fitHeight));
  viewport.style.width = `${SLIDE_WIDTH * scale}px`;
  viewport.style.height = `${SLIDE_HEIGHT * scale}px`;
  slide.style.transform = `scale(${scale})`;
  slide.dataset.scale = String(scale);
  if (!present) stage.scrollLeft = 0;
}
function unique(prefix: string) {
  return prefix + '-' + crypto.randomUUID().slice(0, 8);
}
function addSlide(duplicate = false) {
  const id = unique('slide'),
    old = session.currentId(),
    before = session.manifest.slides[session.current + 1] || null;
  if (
    !mutate(() => {
      session.store.add(
        {
          id,
          kind: 'slide',
          name: id + '.md',
          text: duplicate
            ? session.store.get(old).text
            : '<!-- milo: layout=essay -->\n\n# 新しい問い\n\nここから、考えを続ける。\n',
        },
        before,
      );
    })
  )
    return;
  session.current = session.manifest.slides.indexOf(id);
  session.activeTab = 'slide';
  session.activeBlock = id;
  go(session.current);
}
function moveSlide(delta: number) {
  const ids = [...session.manifest.slides],
    to = session.current + delta;
  if (to < 0 || to >= ids.length) return;
  [ids[session.current], ids[to]] = [ids[to], ids[session.current]];
  const id = ids[to],
    before = ids[to + 1] || null;
  if (!mutate(() => session.store.moveBefore(id, before))) return;
  session.current = to;
  go(to);
}
function removeSlide() {
  if (session.manifest.slides.length <= 1) return;
  if (!confirm('このスライドを削除しますか？この操作は取り消せません。')) return;
  const id = session.currentId();
  if (!mutate(() => session.store.remove(id))) return;
  session.activeBlock = session.currentId();
  go(session.current);
}
async function connect() {
  if (binding) return;
  try {
    if (!remembered) {
      if (!('showOpenFilePicker' in window))
        throw new Error(
          'ダウンロードしたHTMLをデスクトップ版ChromeまたはEdgeで開いて接続してください。',
        );
    }
    binding = true;
    updateSave();
    // Open the picker directly inside the user's gesture, before file reading.
    const handle: FileHandle = remembered
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
  session.store.attach(disk, session.boot);
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
      if (!(await drafts.preserveConflict())) {
        toast('未保存の編集をブラウザに退避できないため、読み直しを中止しました。');
        return;
      }
      const text = await readFile(saver.handle!);
      const disk = SourceStore.fromHTML(text);
      session.store.restore(disk.snapshot());
      session.rebase();
      drafts.rebase(session.opening.blocks);
      saver.bind(saver.handle!, text);
      updateNav();
      session.activeBlock = session.currentId();
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
  const ids = new Set([...session.opening.blocks.map((b) => b.id), ...session.store.blocks.keys()]);
  let html = '';
  if (session.slideOrderChanged()) {
    const before = session.opening.blocks
      .filter((b) => b.kind === 'slide')
      .map((b) => b.text.match(/^#\s+(.+)$/m)?.[1] || b.name);
    const after = session.store.list('slide').map((b) => session.titleOf(b.id));
    html += `<section class="diff-section"><h3>スライドの順序</h3><p>変更前: ${esc(before.join(' → '))}</p><p>変更後: ${esc(after.join(' → '))}</p></section>`;
  }
  for (const id of ids) {
    const old = session.opening.blocks.find((b) => b.id === id),
      b = session.store.blocks.get(id);
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
    const content = await readImageAsset(file);
    const id = replaceId || unique('asset');
    if (
      !mutate(() => {
        if (replaceId) session.store.setText(id, content);
        else session.store.add({ id, kind: 'asset', name: file.name, text: content });
      })
    )
      return;
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
  if (session.activeTab === 'slide') {
    addSlide();
    return;
  }
  if (session.activeTab === 'asset') {
    chooseAsset();
    return;
  }
};
$('source-select').onchange = (e) => selectBlock((e.target as HTMLSelectElement).value);
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(
  (b) =>
    (b.onclick = () => {
      session.activeTab = b.dataset.tab as Kind;
      session.activeBlock =
        session.activeTab === 'slide'
          ? session.currentId()
          : session.store.list(session.activeTab)[0]?.id || '';
      refreshInspector();
    }),
);
$('connect').onclick = () => void connect();
$('present').onclick = () => setPresent(!present);
$('previous').onclick = () => go(session.current - 1);
$('next').onclick = () => go(session.current + 1);
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
    go(session.current + 1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    go(session.current - 1);
  } else if (e.key === 'Escape' && present) setPresent(false);
  else if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey) setPresent(!present);
});
window.addEventListener('beforeunload', (e) => {
  if ((saver.handle && saver.dirty()) || (!saver.handle && session.sourceChanged())) {
    e.preventDefault();
    e.returnValue = '';
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    updates.cancelCache();
    if ((saver.handle && saver.dirty()) || (!saver.handle && session.sourceChanged()))
      void drafts.persist('hidden');
    void saver.flush();
  }
});
async function restoreLocal() {
  const recovery = await drafts.recovery();
  remembered = (await cacheGet('handle:' + cacheKey)) || null;
  updateSave();
  if (recovery) {
    dialog(
      '未保存の編集が残っています',
      `<p>${recovery.changedBase ? '退避後にHTML側も変更されています。内容を確認してから復元してください。' : '前回このブラウザに退避された原稿があります。復元すると、現在の原稿にその編集を戻します。'}</p><div class="dialog-actions"><button class="button" id="discard-draft">現在のHTMLを使う</button><button class="button primary" id="restore-draft">編集を復元</button></div>`,
    );
    $('discard-draft').onclick = () => {
      void drafts.discard(recovery.storage);
      $<HTMLDialogElement>('dialog').close();
      void tryResume();
    };
    $('restore-draft').onclick = () => {
      void drafts.discard(recovery.storage);
      mutate(() => drafts.restore(recovery.draft));
      refreshInspector();
      $<HTMLDialogElement>('dialog').close();
      void tryResume();
    };
    return;
  }
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
session.readManifest();
updateNav();
session.activeBlock = session.currentId();
refreshInspector();
refreshSlide();
const slideResizeObserver =
  typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scaleSlide);
slideResizeObserver?.observe($('stage-scroll'));
window.addEventListener('resize', scaleSlide);
scaleSlide();
updateSave();
void restoreLocal();
