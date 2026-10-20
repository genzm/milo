import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTalkMarkdown, loadDeck, slideLayout } from '../cli/compile.mjs';
import { json } from '../src/source.ts';

test('frontmatter and markdown images compile from a single talk file', async () => {
  const talk = parseTalkMarkdown(`---
title: Demo
description: A deck
---

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
  assert.equal(talk.slides.length, 2);
  assert.match(talk.slides[0], /<!-- milo: layout=cover -->/);
  assert.match(talk.slides[0], /# Cover\n/);
  assert.match(talk.slides[1], /!\[loop]\(\.\/assets\/flow\.gif\)/);

  const deck = await loadDeck('content');
  assert.equal(deck.title, '小さな実験室');
  assert.deepEqual(
    deck.blocks.filter((b) => b.kind === 'slide').map((b) => b.id),
    ['slide-01', 'slide-02', 'slide-03', 'slide-04', 'slide-05'],
  );
  assert.deepEqual(json(deck.blocks.find((b) => b.id === 'manifest').text), {
    title: '小さな実験室',
  });
  const asset = deck.blocks.find((b) => b.kind === 'asset');
  assert.equal(asset?.id, 'asset-flow');
  assert.equal(asset?.name, 'assets/flow.gif');
});

test('a thematic break inside a fence is not a slide separator', () => {
  const talk = parseTalkMarkdown(`# Slide

\`\`\`txt
foo
---
bar
\`\`\`

---

# Next
`);
  assert.equal(talk.slides.length, 2);
  assert.match(talk.slides[0], /```txt\nfoo\n---\nbar\n```/);
  assert.match(talk.slides[1], /^# Next\n/);
});

test('model fences remain ordinary code instead of being extracted from the source', () => {
  const source = '# Code\n\n```milo:model wave\n{"input":"t"}\n```\n';
  const talk = parseTalkMarkdown(source);
  assert.equal(talk.slides[0], source);
  assert.equal(Object.hasOwn(talk, 'models'), false);
});

test('a thematic break inside a canvas node is not a slide separator', () => {
  const talk = parseTalkMarkdown(`# Slide

@canvas
@node before
### Before

---

After the rule
@endcanvas

---

# Next
`);
  assert.equal(talk.slides.length, 2);
  assert.match(talk.slides[0], /After the rule/);
  assert.match(talk.slides[1], /^# Next/);
});

test('YAML frontmatter keeps quoted titles and multiline descriptions', () => {
  const talk = parseTalkMarkdown(`---
title: "Foo: Bar"
description: |
  複数行の
  description
---

# One
`);
  assert.equal(talk.meta.title, 'Foo: Bar');
  assert.equal(talk.meta.description, '複数行の\ndescription\n');
});
