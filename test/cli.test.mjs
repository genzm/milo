import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, symlink, link, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { buildReport, compile, parseTalkMarkdown, loadDeck, slideLayout } from '../cli/compile.mjs';
import { json } from '../src/source.ts';

const exec = promisify(execFile);

test('CLI refuses to overwrite the input Markdown, including directory input and normalized paths', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'milo-source-'));
  const source = '# Original\n\nKeep this source.\n';
  const file = join(dir, 'slides.md');
  try {
    await writeFile(file, source);
    for (const input of [file, dir]) {
      for (const pdf of [[], ['--pdf']]) {
        await assert.rejects(
          exec(process.execPath, ['cli/milo.mjs', input, '-o', `${dir}/./slides.md`, ...pdf]),
          (error) => {
            assert.equal(error.code, 1);
            assert.match(error.stderr, /元のMarkdownと同じファイル/);
            assert.equal(error.stdout, '');
            return true;
          },
        );
        assert.equal(await readFile(file, 'utf8'), source);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('compilation rejects symbolic and hard links to the original Markdown as output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'milo-source-links-'));
  const source = '# Preserve me\n';
  const input = join(dir, 'slides.md');
  try {
    await writeFile(input, source);
    for (const [name, createLink] of [
      ['symbolic.html', symlink],
      ['hard.html', link],
    ]) {
      const out = join(dir, name);
      await createLink(input, out);
      await assert.rejects(compile({ input, out }), /元のMarkdownと同じファイル/);
      assert.equal(await readFile(input, 'utf8'), source);
      assert.equal(await readFile(out, 'utf8'), source);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

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

test('CLI names the slide when an image or layout cannot be compiled', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'milo-errors-'));
  const file = join(dir, 'slides.md');
  const cases = [
    [
      '# One\n\n---\n\n![gone](./missing.png)\n',
      /スライド 2: 画像が見つかりません: \.\/missing\.png/,
    ],
    ['::image{asset="./missing.png"}\n', /スライド 1: 画像が見つかりません: \.\/missing\.png/],
    ['![x](./notes.txt)\n', /スライド 1: 未対応の画像です: \.\/notes\.txt/],
    ['![x](../outside.png)\n', /スライド 1: 画像パスが文書の外を指しています: \.\.\/outside\.png/],
    [
      '# One\n\n---\n\n<!-- milo: layout=nope -->\n\n# Two\n',
      /スライド 2: 未対応のレイアウトです: nope/,
    ],
    ['# One\n\n---\n', /スライド 2 は空です。/],
  ];
  try {
    for (const [source, pattern] of cases) {
      await writeFile(file, source);
      await assert.rejects(exec(process.execPath, ['cli/milo.mjs', file]), (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, pattern);
        assert.doesNotMatch(error.stderr, /ENOENT|Error:/);
        assert.equal(error.stdout, '');
        return true;
      });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('build report counts slides and assets separately from other source blocks', () => {
  assert.equal(
    buildReport({
      outPath: '/tmp/talk.html',
      html: 'x'.repeat(2048),
      blocks: [{ kind: 'manifest' }, { kind: 'slide' }, { kind: 'slide' }, { kind: 'asset' }],
    }),
    'Built /tmp/talk.html: 2 KiB; 2 slides, 1 asset; all fonts embedded.',
  );
  assert.equal(
    buildReport({
      outPath: '/tmp/talk.html',
      html: 'x',
      blocks: [{ kind: 'manifest' }, { kind: 'slide' }],
    }),
    'Built /tmp/talk.html: 0 KiB; 1 slide, 0 assets; all fonts embedded.',
  );
});
