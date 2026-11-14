import { $ } from './shell';
import { esc } from '../escape';
import type { EditorSession } from './session';
export function updateNavigation(session: EditorSession, go: (index: number) => void) {
  session.readManifest();
  document.title = session.manifest.title + ' — milo';
  $('document-title').textContent = session.manifest.title;
  $('slide-count').textContent = String(session.manifest.slides.length).padStart(2, '0');
  $('slides').innerHTML = session.manifest.slides
    .map((id, i) => {
      const text = session.store.get(id).text,
        kind = /!\[[^\]]*]\([^)]+\)/.test(text) || text.includes('::image') ? 'image' : 'text',
        layout = session.layoutOf(id);
      const art =
        kind === 'image'
          ? '<div class="thumb-image">GIF <span>↗</span></div>'
          : '<div class="thumb-lines"><i></i><i></i><i></i></div>';
      return `<button class="slide-thumb ${i === session.current ? 'active' : ''}" data-index="${i}" aria-label="スライド ${i + 1}: ${esc(session.titleOf(id))}" ${i === session.current ? 'aria-current="page"' : ''}><span class="thumb-number">${String(i + 1).padStart(2, '0')}</span><span class="thumb-paper thumb-${esc(layout)}"><strong>${esc(session.titleOf(id))}</strong>${art}</span></button>`;
    })
    .join('');
  $('slides')
    .querySelectorAll<HTMLButtonElement>('button')
    .forEach((b) => (b.onclick = () => go(Number(b.dataset.index))));
  $('page-number').textContent =
    session.current === 0 ? '' : `${session.current + 1} / ${session.manifest.slides.length}`;
  $<HTMLButtonElement>('previous').disabled = session.current <= 0;
  $<HTMLButtonElement>('next').disabled = session.current >= session.manifest.slides.length - 1;
  $<HTMLButtonElement>('move-up').disabled = session.current <= 0;
  $<HTMLButtonElement>('move-down').disabled =
    session.current >= session.manifest.slides.length - 1;
  $<HTMLButtonElement>('remove-slide').disabled = session.manifest.slides.length <= 1;
  const layoutSelect = document.getElementById('layout-select') as HTMLSelectElement | null;
  if (
    layoutSelect &&
    session.activeTab === 'slide' &&
    session.store.blocks.has(session.activeBlock)
  )
    layoutSelect.value = session.layoutOf(session.activeBlock);
  const changed = session.changedCount();
  $('change-count').textContent = changed ? String(changed) : '';
}
