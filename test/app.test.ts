import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
// Component Worker test support is currently disabled with the feature.
// import {Worker as NodeWorker} from 'node:worker_threads';
// import {resolveObjectURL} from 'node:buffer';
import { EditorView } from '@codemirror/view';
import { SourceStore, json } from '../src/source.ts';

// DOM-based integration, not an actual Chromium or native file-picker test.
const initial = readFileSync('dist/milo.html', 'utf8');
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
  /* Component Worker shim (disabled with the component feature).
  const workers=new Set<any>();
  class WorkerShim {
    onmessage:any;onerror:any;node:NodeWorker|null=null;queue:any[]=[];closed=false;
    constructor(url:string){workers.add(this);const blob=resolveObjectURL(url);if(!blob)throw new Error('Worker blob missing');void blob.text().then(source=>{if(this.closed)return;this.node=new NodeWorker(`const {parentPort}=require('node:worker_threads'); const self=globalThis; self.postMessage=data=>parentPort.postMessage(data); ${source}\nparentPort.on('message',data=>self.onmessage({data}));`,{eval:true});this.node.on('message',data=>this.onmessage?.({data}));this.node.on('error',error=>this.onerror?.({message:error.message,preventDefault(){}}));for(const data of this.queue)this.node.postMessage(data);this.queue=[];});}
    postMessage(data:any){if(this.node)this.node.postMessage(data);else this.queue.push(data);}
    terminate(){this.closed=true;void this.node?.terminate();workers.delete(this);}
  }
  Object.defineProperty(w,'Worker',{value:WorkerShim});
  */
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
    input: (s: string, value: string) => {
      const el = query(s);
      assert.ok(el, `Missing input ${s}`);
      el.value = value;
      el.dispatchEvent(new w.Event('input', { bubbles: true }));
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
    assert.ok(app.query('.chart-line').getAttribute('d').length > 1000);
    assert.ok(app.query('.katex'));
    assert.equal(app.query('.live-value')?.textContent, '0.2');
    assert.equal(app.query('input[aria-label="gamma"]').value, '0.2');
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

test('display math interrupts prose inside a multiline text directive without blank lines', async () => {
  const app = await launch();
  try {
    const editor = app.code();
    editor.dispatch({
      changes: {
        from: 0,
        to: editor.state.doc.length,
        insert: '::text{\n++Radon-Nikodymの定理++\n任意の...\n$$\nx+A\n$$\n\n$$y+B$$\n\n$$$$\n}\n',
      },
    });
    await until(
      () =>
        app.query('#slide-content .text-block')?.querySelectorAll('.katex-display').length === 2,
      'Display math did not interrupt text directive prose',
    );
    const block = app.query('#slide-content .text-block');
    assert.equal(block.querySelector('u')?.textContent, 'Radon-Nikodymの定理');
    assert.match(block.textContent, /任意の\.\.\./);
    assert.match(block.textContent, /\$\$\$\$/);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test('connect → authored slider → autosave → reopen keeps the exact one-token diff and editor', async () => {
  const app = await launch();
  try {
    app.click('#connect');
    await until(() => app.query('#save-label').textContent === '保存済み', 'File did not connect');
    assert.equal(app.file.writes, 0);
    app.click('[data-index="1"]');
    const originalPath = app.query('.chart-line').getAttribute('d');
    app.input('input[aria-label="gamma"]', '0.35');
    assert.equal(app.query('.live-value').textContent, '0.35');
    assert.notEqual(app.query('.chart-line').getAttribute('d'), originalPath);
    await until(
      () => app.file.writes === 1 && app.query('#save-label').textContent === '保存済み',
      'Autosave did not complete',
    );
    assert.equal(
      app.file.disk === initial.replace('"gamma": 0.2', '"gamma": 0.35'),
      true,
      'Only gamma should change',
    );
    const reopened = await launch(app.file.disk);
    try {
      reopened.click('[data-index="1"]');
      assert.equal(reopened.query('.live-value').textContent, '0.35');
      assert.ok(reopened.query('.cm-content'));
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

test('presentation slider edits update the source and code-editor transactions update the source', async () => {
  const app = await launch();
  try {
    app.click('#connect');
    await until(() => app.query('#save-label').textContent === '保存済み', 'No connection');
    app.click('[data-index="1"]');
    app.click('#present');
    app.input('input[aria-label="gamma"]', '0.6');
    assert.equal(app.query('.live-value').textContent, '0.6');
    await pause(650);
    await until(() => app.file.writes === 1, 'Presentation slider did not save');
    assert.equal(
      json(SourceStore.fromHTML(app.file.disk).get('model-wave').text).parameters.gamma,
      0.6,
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

/* Component integration test retained for when the feature is enabled again.
test('editable Worker source persists, errors are repairable, and hanging code is stopped',async()=>{
  const app=await launch();try{
    app.click('#connect');await until(()=>app.query('#save-label').textContent==='保存済み','No connection');app.click('[data-index="3"]');await until(()=>!!app.query('.component-block svg'),'No component');app.click('[data-tab="component"]');
    let editor=app.code();const original=editor.state.doc.toString();const updated=original.replace('#D42D5A','#a65b36');editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:updated}});
    await until(()=>app.query('.component-block circle[fill="#a65b36"]')!==null,'Component code did not change the diagram');await until(()=>app.query('#save-label').textContent==='保存済み','Component edit did not save');assert.ok(SourceStore.fromHTML(app.file.disk).get('component-phase').text.includes('#a65b36'));
    editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:'function view( {'}});await until(()=>app.query('.component-block')?.classList.contains('block-error'),'Syntax error did not display');assert.ok(app.query('.cm-content'));
    editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:'function view() { while (true) {} }'}});await until(()=>app.query('.component-caption')?.textContent.includes('1.5秒'),'Infinite component was not stopped',3500);assert.ok(app.query('.cm-content'));
    editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:updated}});await until(()=>!!app.query('.component-block circle[fill="#a65b36"]'),'Component did not recover');assert.deepEqual(app.errors,[]);
  }finally{await app.close();}
});
*/

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
