import { slideFrameMarkup } from '../slide-frame';
export const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
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
export const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.file}"/></svg>`;
export const appMarkup = `
<header class="app-header">
  <div class="brand"><span>milo</span></div>
  <div class="document-name"><span class="document-dot"></span><span id="document-title"></span></div>
  <div class="header-actions"><button id="save-state" class="save-state" title="保存の状態"><span class="status-dot"></span><span id="save-label"></span></button><button id="connect" class="button primary">${icon('link')}<span>自動保存を接続</span></button><button id="present" class="button">${icon('play')}<span>発表する</span></button></div>
</header>
<div id="save-notice" class="save-notice" hidden><span id="save-notice-text"></span><button id="resolve-save" class="text-button"></button></div>
<div class="workspace">
  <aside class="sidebar" aria-label="スライド一覧"><div class="sidebar-heading"><span id="slide-count"></span></div><nav id="slides"></nav><div class="slide-operations"><button id="move-up" class="icon-button" title="前へ移動" aria-label="スライドを前へ移動">${icon('up')}</button><button id="move-down" class="icon-button" title="後ろへ移動" aria-label="スライドを後ろへ移動">${icon('down')}</button><button id="duplicate" class="icon-button" title="複製" aria-label="スライドを複製">${icon('copy')}</button><button id="remove-slide" class="icon-button" title="削除" aria-label="スライドを削除">${icon('trash')}</button></div><button id="add-slide" class="add-slide">${icon('plus')}スライドを追加</button></aside>
  <main class="main-stage"><div class="stage-topline"><div class="stage-tools"><button id="diff" class="text-button">変更を見る <span id="change-count"></span></button></div></div>
    <div class="stage-scroll" id="stage-scroll"><div class="slide-viewport" id="slide-viewport"><article class="slide" id="slide">${slideFrameMarkup(true)}</article></div></div>
    <div class="stage-bottom"><nav class="pagination" aria-label="ページ送り"><button id="previous" class="icon-button" aria-label="前のスライド">${icon('left')}</button><span id="page-number"></span><button id="next" class="icon-button" aria-label="次のスライド">${icon('right')}</button></nav></div>
  </main>
  <aside class="inspector" aria-label="原稿と素材の編集"><div class="inspector-tabs" role="tablist"><button data-tab="slide" role="tab">原稿</button><button data-tab="asset" role="tab">素材</button><button data-tab="manifest" role="tab">設定</button></div>
    <div class="inspector-heading"><div class="source-select"><select id="source-select" aria-label="編集するソース"></select><button id="add-source" class="icon-button" aria-label="ソースを追加">${icon('plus')}</button></div></div><div id="inspector-extra"></div><div id="source-editor" class="source-editor"></div><div class="inspector-footer"><span id="source-kind"></span><span>変更は自動で反映</span></div>
  </aside>
</div><div id="toast" class="toast" role="status" hidden></div><input type="file" id="asset-input" accept="image/gif,image/png,image/jpeg,image/webp,image/svg+xml" hidden><dialog id="dialog"><div class="dialog-top"><h2 id="dialog-title"></h2><button id="dialog-close" class="icon-button" aria-label="閉じる">${icon('close')}</button></div><div id="dialog-content"></div></dialog>`;
