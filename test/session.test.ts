import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EditorSession } from '../src/app/session';
import { SourceStore } from '../src/source';

function session() {
  const store = new SourceStore({
    html: null,
    blocks: [
      { id: 'manifest', kind: 'manifest', name: 'manifest', text: '{"title":"Original"}' },
      { id: 'one', kind: 'slide', name: 'One', text: '# One' },
      { id: 'two', kind: 'slide', name: 'Two', text: '# Two' },
    ],
  });
  const session = new EditorSession(store);
  session.readManifest();
  session.activeBlock = 'one';
  return session;
}

test('failed edits restore sources, selection and manifest together', () => {
  const editor = session();
  const before = editor.store.snapshot();
  assert.throws(
    () =>
      editor.mutate(() => {
        editor.store.remove('one');
        editor.store.setText('manifest', '{"title":"Changed"}');
        editor.activeBlock = 'two';
        editor.current = 1;
        editor.readManifest();
        throw new Error('Edit failed');
      }),
    /Edit failed/,
  );
  assert.deepEqual(editor.store.snapshot(), before);
  assert.equal(editor.activeBlock, 'one');
  assert.equal(editor.current, 0);
  assert.equal(editor.manifest.title, 'Original');
  assert.deepEqual(editor.manifest.slides, ['one', 'two']);
  assert.equal(editor.sourceChanged(), false);
});

test('physical reordering is a change and rebasing adopts the new document baseline', () => {
  const editor = session();
  assert.equal(
    editor.mutate(() => editor.store.setText('one', '# One')),
    false,
  );
  assert.equal(
    editor.mutate(() => editor.store.moveBefore('two', 'one')),
    true,
  );
  editor.readManifest();
  assert.equal(editor.currentId(), 'two');
  assert.equal(editor.sourceChanged(), true);
  assert.equal(editor.changedCount(), 1);
  editor.rebase();
  assert.equal(editor.sourceChanged(), false);
  assert.equal(editor.changedCount(), 0);
  assert.deepEqual(editor.boot, editor.store.snapshot());
});
