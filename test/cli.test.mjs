import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTalkMarkdown, loadDeck, slideLayout } from '../cli/compile.mjs';
import { json } from '../src/source.ts';

test('frontmatter, model fences and markdown images compile from a single talk file', async () => {
  const talk = parseTalkMarkdown(`---
title: Demo
description: A deck
---

\`\`\`milo:model wave
{
  "input": "t",
  "parameters": { "gamma": 0.2 },
  "expression": "exp(-gamma * t)"
}
\`\`\`

<!-- milo: layout=cover -->

# Cover

Hello

---

<!-- milo: layout=lab -->

![loop](./assets/flow.gif)
`);
  assert.equal(talk.meta.title, 'Demo');
  assert.equal(talk.meta.description, 'A deck');
  assert.equal(slideLayout(talk.slides[0]), 'cover');
  assert.equal(slideLayout(talk.slides[1]), 'lab');
  assert.equal(talk.models[0].id, 'model-wave');
  assert.equal(talk.slides.length, 2);
  assert.match(talk.slides[0], /<!-- milo: layout=cover -->/);
  assert.match(talk.slides[0], /# Cover\n/);
  assert.match(talk.slides[1], /!\[loop]\(\.\/assets\/flow\.gif\)/);
  assert.equal(
    talk.slides.some((s) => s.includes('milo:model')),
    false,
  );

  const deck = await loadDeck('content');
  assert.equal(deck.title, '小さな実験室');
  assert.deepEqual(
    deck.blocks.filter((b) => b.kind === 'slide').map((b) => b.id),
    ['slide-01', 'slide-02', 'slide-03'],
  );
  assert.deepEqual(json(deck.blocks.find((b) => b.id === 'manifest').text).layouts, {
    'slide-01': 'cover',
    'slide-02': 'lab',
    'slide-03': 'media',
  });
  assert.ok(deck.blocks.some((b) => b.id === 'model-wave'));
  const asset = deck.blocks.find((b) => b.kind === 'asset');
  assert.equal(asset?.id, 'asset-flow');
  assert.equal(asset?.name, 'assets/flow.gif');
});
