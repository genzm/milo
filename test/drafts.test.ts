import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DraftStore } from '../src/drafts.ts';
import { SourceStore } from '../src/source.ts';

function fixture() {
  const store = new SourceStore({
    html: null,
    blocks: [
      { id: 'manifest', kind: 'manifest', name: 'settings', text: '{}' },
      { id: 'slide-a', kind: 'slide', name: 'A', text: '# A' },
      { id: 'slide-b', kind: 'slide', name: 'B', text: '# B' },
    ],
  });
  const baseline = store.snapshot();
  const values = new Map<string, unknown>();
  const failures = new Set<string>();
  const drafts = new DraftStore('test', store, baseline.blocks, {
    get: async (key) => structuredClone(values.get(key)),
    set: async (key, value) => {
      if (failures.has(key)) return false;
      if (value === undefined) values.delete(key);
      else values.set(key, structuredClone(value));
      return true;
    },
  });
  return { store, baseline, values, failures, drafts };
}

test('draft recovery restores edits, additions, deletions and physical slide order', async () => {
  const { store, baseline, drafts } = fixture();
  store.setText('slide-b', '# Edited');
  store.remove('slide-a');
  store.add({ id: 'slide-c', kind: 'slide', name: 'C', text: '# Added' });
  store.moveBefore('slide-c', 'slide-b');
  await drafts.persist('hidden');
  store.restore(baseline);
  const recovery = await drafts.recovery();
  assert.ok(recovery);
  assert.equal(recovery.changedBase, false);
  store.setText('slide-a', '# External edit');
  assert.equal((await drafts.recovery())?.changedBase, true);
  drafts.restore(recovery.draft);
  assert.deepEqual(
    store.list('slide').map((block) => block.id),
    ['slide-c', 'slide-b'],
  );
  assert.equal(store.get('slide-b').text, '# Edited');
  assert.equal(store.get('slide-c').text, '# Added');
  assert.equal(await drafts.recovery(), null);
});

test('a draft containing only a slide reorder remains recoverable', async () => {
  const { store, baseline, drafts } = fixture();
  store.moveBefore('slide-b', 'slide-a');
  await drafts.persist();
  store.restore(baseline);
  const recovery = await drafts.recovery();
  assert.ok(recovery);
  assert.equal(recovery.changedBase, false);
  drafts.restore(recovery.draft);
  assert.deepEqual(
    store.list('slide').map((b) => b.id),
    ['slide-b', 'slide-a'],
  );
  assert.equal(store.get('slide-a').text, '# A');
  assert.equal(store.get('slide-b').text, '# B');
});

test('archiving requires saved, matching content and a successful archive write', async () => {
  const { store, drafts, values, failures } = fixture();
  const saved = { state: 'saved' as const, dirty: () => false };
  store.setText('slide-a', '# Draft');
  await drafts.persist();
  await drafts.archive({ ...saved, dirty: () => true });
  assert.ok(values.has('draft:test'));
  store.setText('slide-a', '# Newer edit');
  await drafts.archive(saved);
  assert.ok(values.has('draft:test'));
  await drafts.persist();
  failures.add('previous:test');
  await drafts.archive(saved);
  assert.ok(values.has('draft:test'));
  failures.clear();
  await drafts.archive(saved);
  assert.equal(values.has('draft:test'), false);
  assert.equal((values.get('previous:test') as { reason: string }).reason, 'saved');
});

test('failed conflict backup retains the draft and successful backup remains recoverable', async () => {
  const { store, drafts, baseline, values, failures } = fixture();
  store.setText('slide-a', '# Unsaved');
  failures.add('conflict:test');
  assert.equal(await drafts.preserveConflict(), false);
  assert.ok(values.has('draft:test'));
  failures.clear();
  assert.equal(await drafts.preserveConflict(), true);
  assert.equal(values.has('draft:test'), false);
  store.restore(baseline);
  const recovery = await drafts.recovery();
  assert.equal(recovery?.storage, 'conflict');
  assert.equal(recovery?.draft.reason, 'conflict');
  await drafts.discard(recovery!.storage);
  assert.equal(await drafts.recovery(), null);
});

test('rebasing records the current baseline and ignores differences in newline encoding', async () => {
  const { store, drafts } = fixture();
  store.setText('slide-a', '# External\n\nText');
  drafts.rebase(store.snapshot().blocks);
  store.setText('slide-a', '# Draft');
  await drafts.persist();
  store.setText('slide-a', '# External\r\n\r\nText');
  assert.equal((await drafts.recovery())?.changedBase, false);
});
