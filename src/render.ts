import { prepareSlide } from './markdown/slide';
import { mountBlocks } from './render/blocks';
import { RenderScope, type Rendered } from './render/lifecycle';
import { watchSlideCorners } from './slide-radius';
import type { RenderContext } from './render/context';

export { assetURL } from './assets';
export { esc } from './escape';
export type { RenderContext } from './render/context';
export type { Rendered } from './render/lifecycle';

export function renderSlide(root: HTMLElement, source: string, ctx: RenderContext): Rendered {
  const scope = new RenderScope();
  try {
    const { md, blocks, tasks, display } = prepareSlide(source, ctx);
    const context: RenderContext = {
      ...ctx,
      renderMarkdown: (text) => md.render(text),
      renderInline: (text) => md.renderInline(text),
    };
    root.dataset.markdown = 'slide';
    root.innerHTML = md.render(display);
    mountBlocks(root, blocks, md, context, scope);
    const toggleTask = (event: Event) => {
      const target = event.target as Element | null,
        button = target?.closest<HTMLButtonElement>('.task-marker');
      if (!button || !root.contains(button)) return;
      const task = tasks[Number(button.dataset.task)];
      if (!task) return;
      event.preventDefault();
      event.stopPropagation();
      task.checked = !task.checked;
      button.setAttribute('aria-checked', String(task.checked));
      button.setAttribute(
        'aria-label',
        task.checked ? '完了済み。未完了に戻す' : '未完了。完了にする',
      );
      ctx.patchSource?.(task.at, task.at + 1, task.checked ? 'x' : ' ');
    };
    const openAsset = (event: Event) => {
      if (ctx.present()) return;
      const img = (event.target as Element | null)?.closest<HTMLImageElement>('img.embedded-image');
      if (!img || !root.contains(img) || !img.dataset.asset) return;
      event.preventDefault();
      ctx.inspect(img.dataset.asset);
    };
    root.addEventListener('click', toggleTask);
    root.addEventListener('dblclick', openAsset);
    scope.onDispose(() => {
      root.removeEventListener('click', toggleTask);
      root.removeEventListener('dblclick', openAsset);
    });
    scope.add(watchSlideCorners(root));
    scope.update();
    return scope;
  } catch (error) {
    scope.dispose();
    throw error;
  }
}
