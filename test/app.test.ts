import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { EditorView } from '@codemirror/view';
import { SourceStore, json } from '../src/source.ts';

// DOM-based integration, not an actual Chromium or native file-picker test.
function appFixture(html: string) {
  const store = SourceStore.fromHTML(html);
  for (const slide of store.list('slide')) store.remove(slide.id);
  const slides = [
    {
      id: 'slide-01',
      name: 'fixture.md#1',
      text: '<!-- milo: layout=cover -->\n\n# 君とボク。\n\n> テスト用の表紙。\n',
    },
    {
      id: 'slide-02',
      name: 'fixture.md#2',
      text: '<!-- milo: layout=lab -->\n\n# Notes\n\n数式 $E=mc^2$ とチェックリスト。\n\n- [ ] 内容を確認する\n',
    },
    {
      id: 'slide-03',
      name: 'fixture.md#3',
      text: '<!-- milo: layout=media -->\n\n# Media\n\n![loop](./assets/flow.gif)\n\n$E=mc^2$\n',
    },
  ];
  for (const slide of slides) store.add({ ...slide, kind: 'slide' });
  store.setText('manifest', '{\n  "title": "Fixture"\n}\n');
  return store.html!;
}
const initial = appFixture(readFileSync('dist/milo.html', 'utf8'));
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, message: string, ms = 3000) {
  const started = Date.now();
  while (!fn()) {
    if (Date.now() - started > ms) throw new Error(message);
    await pause(30);
  }
}
function createFile(text: string) {
  let disk = text,
    writes = 0;
  return {
    get disk() {
      return disk;
    },
    set disk(s: string) {
      disk = s;
    },
    get writes() {
      return writes;
    },
    handle: {
      name: 'milo.html',
      requestPermission: async () => 'granted',
      queryPermission: async () => 'granted',
      getFile: async () => ({ arrayBuffer: async () => new TextEncoder().encode(disk).buffer }),
      createWritable: async () => {
        let pending = '';
        return {
          write: async (s: string) => {
            pending = s;
            writes++;
          },
          close: async () => {
            disk = pending;
          },
          abort: async () => {},
        };
      },
    },
  };
}
async function launch(html = initial, file = createFile(html)) {
  const w = new Window({
    url: 'https://milo.invalid/deck.html',
    settings: {
      enableJavaScriptEvaluation: false,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      disableComputedStyleRendering: true,
    },
  });

  Object.defineProperty(w, 'Blob', { value: Blob });
  Object.defineProperty(w, 'URL', { value: URL });
  Object.defineProperty(w, 'TextEncoder', { value: TextEncoder });
  Object.defineProperty(w, 'TextDecoder', { value: TextDecoder });
  (w as any).showOpenFilePicker = async () => [file.handle];
  (w as any).confirm = () => true;
  w.fetch = (async () => {
    throw new Error('No network allowed in single-file test');
  }) as any;
  const errors: string[] = [];
  w.addEventListener('error', (e: any) => {
    errors.push(e.message);
    e.preventDefault();
  });
  w.document.write(html);
  w.eval(w.document.getElementById('milo-runtime')!.textContent!);
  w.eval(w.document.getElementById('milo-launcher')!.textContent!);
  const query = (s: string) => w.document.querySelector(s) as any;
  await until(() => !!query('.cm-content'), 'Editor did not initialize');
  return {
    w,
    file,
    query,
    errors,
    click: (s: string) => {
      assert.ok(query(s), `Missing ${s}`);
      query(s).click();
    },
    code: () => EditorView.findFromDOM(query('.cm-content'))!,
    close: async () => {
      await w.happyDOM.abort();
      w.close();
    },
  };
}

test('standalone app boots and all three slides render without network dependencies', async () => {
  const app = await launch();
  try {
    assert.equal(app.query('#slide-content h1').textContent, '君とボク。');
    assert.ok(app.query('#slide').className.includes('layout-cover'));
    app.click('[data-index="1"]');
    assert.ok(app.query('.task-marker'));
    assert.ok(app.query('.katex'));
    assert.equal(app.query('[data-tab="model"]'), null);
    assert.equal(app.query('input[type="range"]'), null);
    app.click('[data-index="2"]');
    assert.ok(app.query('.embedded-image').src.startsWith('data:image/gif;base64,'));
    assert.ok(app.query('.katex'));
    assert.equal(app.query('[data-tab="component"]'), null);
    assert.equal(app.query('.component-block'), null);
    assert.equal(app.query('#insert-block'), null);
    assert.equal(app.query('#undo'), null);
    assert.equal(app.query('#redo'), null);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('layout control edits the hidden slide metadata as the single source of truth', async () => {
  const app = await launch();
  try {
    const editor = app.code(),
      select = app.query('#layout-select');
    assert.equal(select.value, 'cover');
    assert.ok(editor.state.doc.toString().startsWith('<!-- milo: layout=cover -->'));
    assert.ok(!app.query('.cm-content').textContent.includes('milo: layout'));

    select.value = 'media';
    select.dispatchEvent(new app.w.Event('change', { bubbles: true }));
    await until(
      () => app.query('#slide').className.includes('layout-media'),
      'Layout did not change',
    );
    assert.ok(editor.state.doc.toString().startsWith('<!-- milo: layout=media -->'));
    assert.equal(json(SourceStore.fromHTML(app.file.disk).get('manifest').text).layouts, undefined);

    const metadata = editor.state.doc.toString(),
      layoutAt = metadata.indexOf('media');
    assert.ok(layoutAt >= 0);
    editor.dispatch({
      changes: { from: layoutAt, to: layoutAt + 'media'.length, insert: 'section' },
    });
    await until(
      () => app.query('#slide').className.includes('layout-section'),
      'Metadata edit did not change layout',
    );
    assert.equal(app.query('#layout-select').value, 'section');
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('editor and presentation keep one logical slide layout and only change scale', async () => {
  const app = await launch();
  try {
    const stage = app.query('#stage-scroll');
    let width = 800,
      height = 600;
    Object.defineProperties(stage, {
      clientWidth: { configurable: true, get: () => width },
      clientHeight: { configurable: true, get: () => height },
    });
    stage.style.padding = '0';
    assert.equal(app.w.document.documentElement.style.getPropertyValue('--slide-width'), '1600px');
    assert.equal(app.w.document.documentElement.style.getPropertyValue('--slide-height'), '900px');
    app.w.dispatchEvent(new app.w.Event('resize'));
    assert.equal(app.query('#slide').dataset.scale, '0.5');
    assert.equal(app.query('#slide-viewport').style.width, '800px');
    assert.equal(stage.scrollLeft, 0);
    app.click('[data-index="1"]');
    assert.equal(app.w.document.querySelectorAll('.task-marker').length, 1);
    const content = app.query('#slide-content').innerHTML;

    width = 3200;
    height = 1800;
    app.click('#present');
    assert.equal(app.query('#slide').dataset.scale, '2');
    assert.equal(app.query('#slide-viewport').style.width, '3200px');
    assert.equal(app.w.document.querySelectorAll('.task-marker').length, 1);
    assert.equal(app.query('#slide-content').innerHTML, content);
    assert.ok(app.query('body').classList.contains('presenting'));
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('display math interrupts prose inside a box without blank lines', async () => {
  const app = await launch();
  try {
    const editor = app.code();
    editor.dispatch({
      changes: {
        from: 0,
        to: editor.state.doc.length,
        insert:
          '@box\n++Radon-Nikodymの定理++\n任意の...\n$$\nx+A\n$$\n\n$$y+B$$\n\n$$$$\n@endbox\n',
      },
    });
    await until(
      () => app.query('#slide-content .box-block')?.querySelectorAll('.katex-display').length === 2,
      'Display math did not interrupt text directive prose',
    );
    const block = app.query('#slide-content .box-block');
    assert.equal(block.querySelector('u')?.textContent, 'Radon-Nikodymの定理');
    assert.match(block.textContent, /任意の\.\.\./);
    assert.match(block.textContent, /\$\$\$\$/);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('clicking a task item patches the Markdown source and editor', async () => {
  const app = await launch();
  try {
    const editor = app.code();
    editor.dispatch({
      changes: {
        from: 0,
        to: editor.state.doc.length,
        insert: '# Tasks\n\n- [ ] 未完了\n- [x] 完了済み\n',
      },
    });
    await until(
      () => app.w.document.querySelectorAll('.task-marker').length === 2,
      'Task items did not render',
    );
    app.click('.task-marker[data-task="0"]');
    assert.match(editor.state.doc.toString(), /- \[x\] 未完了/);
    assert.equal(app.query('.task-marker[data-task="0"]').getAttribute('aria-checked'), 'true');
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('connect → task toggle → autosave → reopen preserves the exact source patch', async () => {
  const app = await launch();
  try {
    app.click('#connect');
    await until(() => app.query('#save-label').textContent === '保存済み', 'File did not connect');
    assert.equal(app.file.writes, 0);
    app.click('[data-index="1"]');
    app.click('.task-marker');
    assert.match(app.code().state.doc.toString(), /- \[x\] 内容を確認する/);
    await until(
      () => app.file.writes === 1 && app.query('#save-label').textContent === '保存済み',
      'Autosave did not complete',
    );
    assert.equal(app.file.disk, initial.replace('- [ ] 内容を確認する', '- [x] 内容を確認する'));
    const reopened = await launch(app.file.disk);
    try {
      reopened.click('[data-index="1"]');
      assert.equal(reopened.query('.task-marker').getAttribute('aria-checked'), 'true');
      assert.match(reopened.code().state.doc.toString(), /- \[x\] 内容を確認する/);
    } finally {
      await reopened.close();
    }
  } finally {
    await app.close();
  }
});

test('Cmd+S suppresses browser save, connects when needed, and flushes from the editor', async () => {
  const app = await launch();
  try {
    const connectEvent = new app.w.KeyboardEvent('keydown', {
      key: 's',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    app.w.document.dispatchEvent(connectEvent);
    assert.equal(connectEvent.defaultPrevented, true);
    await until(() => app.query('#save-label').textContent === '保存済み', 'Cmd+S did not connect');
    const editor = app.code();
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: '# Cmd+S で保存\n\n本文' },
    });
    const saveEvent = new app.w.KeyboardEvent('keydown', {
      key: 's',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    app.query('.cm-content').dispatchEvent(saveEvent);
    assert.equal(saveEvent.defaultPrevented, true);
    await until(
      () => app.file.writes === 1 && app.query('#save-label').textContent === '保存済み',
      'Cmd+S did not flush',
    );
    assert.equal(
      SourceStore.fromHTML(app.file.disk).get('slide-01').text,
      '# Cmd+S で保存\n\n本文',
    );
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('presentation task toggles and code-editor transactions update the source', async () => {
  const app = await launch();
  try {
    app.click('#connect');
    await until(() => app.query('#save-label').textContent === '保存済み', 'No connection');
    app.click('[data-index="1"]');
    app.click('#present');
    app.click('.task-marker');
    assert.equal(app.query('.task-marker').getAttribute('aria-checked'), 'true');
    await until(() => app.file.writes === 1, 'Presentation task toggle did not save');
    assert.match(
      SourceStore.fromHTML(app.file.disk).get('slide-02').text,
      /- \[x\] 内容を確認する/,
    );
    app.click('#present');
    app.click('[data-tab="slide"]');
    const editor = app.code();
    assert.ok(editor);
    editor.dispatch({
      changes: {
        from: 0,
        to: editor.state.doc.length,
        insert: '# 編集したタイトル\n\n$E=mc^2$\n\nコード例: `</script>`',
      },
    });
    await until(
      () => app.query('#slide-content h1')?.textContent === '編集したタイトル',
      'Source edit did not render',
    );
    await until(
      () => app.query('#save-label').textContent === '保存済み',
      'Source edit did not save',
    );
    assert.ok(SourceStore.fromHTML(app.file.disk).get('slide-02').text.includes('</script>'));
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('importing and inserting an SVG asset saves a reopenable embedded image', async () => {
  const app = await launch();
  try {
    app.click('#connect');
    await until(() => app.query('#save-label').textContent === '保存済み', 'No connection');
    app.click('[data-tab="asset"]');
    app.click('#add-source');
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10Z"/></svg>';
    const file = new app.w.File([svg], 'shape.svg', { type: 'image/svg+xml' });
    Object.defineProperty(app.query('#asset-input'), 'files', { value: [file] });
    app.query('#asset-input').dispatchEvent(new app.w.Event('change', { bubbles: true }));
    await until(
      () => !!app.query('.asset-preview img[src^="data:image/svg+xml"]'),
      'SVG import failed',
    );
    const id = app.query('#source-select').value;
    app.click('#insert-asset');
    await until(() => app.query('#save-label').textContent === '保存済み', 'SVG did not save');
    const saved = SourceStore.fromHTML(app.file.disk);
    assert.equal(saved.get(id).text, `mime: image/svg+xml\n\n${svg}`);
    assert.match(saved.get('slide-01').text, /!\[画像\]\(shape\.svg\)/);
    const reopened = await launch(app.file.disk);
    try {
      assert.ok(reopened.query('#slide-content img[src^="data:image/svg+xml"]'));
      assert.deepEqual(reopened.errors, []);
    } finally {
      await reopened.close();
    }
  } finally {
    await app.close();
  }
});

test('reordering before connecting marks unsaved changes and warns on exit until reverted', async () => {
  const app = await launch();
  const leaving = () => {
    const event = new app.w.Event('beforeunload', { cancelable: true });
    app.w.dispatchEvent(event);
    return event.defaultPrevented;
  };
  try {
    assert.equal(leaving(), false);
    app.click('#move-down');
    assert.equal(app.query('#save-label').textContent, '未接続 · 未保存');
    assert.equal(app.query('#change-count').textContent, '1');
    assert.equal(leaving(), true);
    app.click('#diff');
    assert.match(app.query('#dialog-content').textContent, /スライドの順序/);
    assert.match(app.query('#dialog-content').textContent, /変更後: Notes → 君とボク。 → Media/);
    assert.equal(app.query('.empty-diff'), null);
    app.click('#dialog-close');
    app.click('#move-up');
    assert.equal(app.query('#save-label').textContent, '自動保存 未接続');
    assert.equal(app.query('#change-count').textContent, '');
    assert.equal(leaving(), false);
    assert.equal(app.file.writes, 0);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('adding, reordering and deleting slides preserves a reopenable deck', async () => {
  const app = await launch();
  try {
    assert.equal(app.query('#undo'), null);
    assert.equal(app.query('#redo'), null);
    app.click('#connect');
    await until(() => app.query('#save-label').textContent === '保存済み', 'No connection');
    app.click('#add-slide');
    assert.equal(app.query('#slide-count').textContent, '04');
    app.click('#move-down');
    app.click('#remove-slide');
    assert.equal(app.query('#slide-count').textContent, '03');
    await until(
      () => app.query('#save-label').textContent === '保存済み',
      'Structural edit did not save',
    );
    const store = SourceStore.fromHTML(app.file.disk),
      ids = store.list('slide').map((b) => b.id);
    assert.equal(ids.length, 3);
    assert.deepEqual(ids, ['slide-01', 'slide-02', 'slide-03']);
    assert.equal(Object.hasOwn(json(store.get('manifest').text), 'slides'), false);
    assert.ok(ids.every((id) => store.blocks.has(id)));
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});
