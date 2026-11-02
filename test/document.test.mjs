import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTalkMarkdown } from '../cli/document.mjs';

test('literal and inline image directives do not become asset dependencies', () => {
  const source = [
    '# Syntax examples',
    '',
    '`::image{asset="./inline.png"}`',
    '',
    'An example: ::image{asset="./prose.png"}',
    '',
    '```',
    '::image{asset="./fenced.png"}',
    '```',
    '',
    '::image{asset="./real.png"}',
  ].join('\n');
  assert.deepEqual(parseTalkMarkdown(source).imageRefs, [{ ref: './real.png', slide: 1 }]);
});

test('paired blocks keep thematic breaks inside the slide and collect nested images', () => {
  for (const name of ['box', 'panel', 'grid', 'stack', 'impact', 'footer', 'canvas', 'diagram']) {
    const source = `# Slide\n\n@${name}\nAlpha\n\n---\n\n![one](./one.png)\n\n::image{asset="./two.png"}\n@end${name}\n\n---\n\n# Next\n\n![three](./three.png)\n`;
    const result = parseTalkMarkdown(source);
    assert.equal(result.slides.length, 2, name);
    assert.ok(result.slides[0].includes('Alpha\n\n---\n\n'), name);
    assert.deepEqual(
      result.imageRefs,
      [
        { ref: './one.png', slide: 1 },
        { ref: './two.png', slide: 1 },
        { ref: './three.png', slide: 2 },
      ],
      name,
    );
  }
});

test('columns, steps and nested boxes use their own bodies for image discovery', () => {
  const source = `# Slide

@columns
@column
::image{asset="./column.png"}
@endcolumn
@column
@steps
@step title="One"
::image{asset="./step.png"}

---

@box
@box
::image{asset="./nested.png"}
@endbox
@endbox
@endsteps
@endcolumn
@endcolumns

---

# Next
`;
  const result = parseTalkMarkdown(source);
  assert.equal(result.slides.length, 2);
  assert.deepEqual(result.imageRefs, [
    { ref: './column.png', slide: 1 },
    { ref: './step.png', slide: 1 },
    { ref: './nested.png', slide: 1 },
  ]);
});
