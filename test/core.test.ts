import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SourceStore, serializeBlock, encode, decode, json, END_MARKER } from '../src/source.ts';
import { parseExpression, evaluate, toTex } from '../src/expression.ts';
import { Autosaver, type FileHandle } from '../src/save.ts';
const fixture = (eol = '\n') =>
  (
    '\ufeff<!doctype html>\n<meta name="milo" content="1">\n<!-- untouched: 日本語 🧪 &amp; -->\n' +
    serializeBlock({
      id: 'manifest',
      name: 'deck.jsonc',
      kind: 'manifest',
      text: '{ "title": "Fixture" }',
    }) +
    '\n<!-- END MILO SETTINGS -->\n' +
    serializeBlock({
      id: 'slide-a',
      name: '原稿.md',
      kind: 'slide',
      text: '# こんにちは 🧪\n\nLiteral </script> <script> <!-- &lt; &amp; & <\n',
    }) +
    '\n<!-- END MILO SLIDES -->\n' +
    serializeBlock({
      id: 'model-wave',
      name: 'wave.jsonc',
      kind: 'model',
      text: '{\n  // this comment stays\n  "parameters": {\n    "gamma": 0.2,\n    "omega": 3.0\n  },\n  "expression": "exp(-gamma * t) < 1"\n}',
    }) +
    '\n<!-- END MILO MODELS -->\n<!-- END MILO COMPONENTS -->\n<!-- END MILO ASSETS -->\n' +
    END_MARKER +
    '\n<script>const untouched = "A";</script>\n'
  ).replace(/\n/g, eol);

test('no-op loading and identity edits preserve every original byte, including BOM/CRLF', () => {
  for (const eol of ['\n', '\r\n']) {
    const source = fixture(eol),
      s = SourceStore.fromHTML(source);
    assert.equal(s.html, source);
    for (const b of s.list()) assert.equal(s.setText(b.id, b.text), false);
    assert.equal(Buffer.compare(Buffer.from(s.html!), Buffer.from(source)), 0);
    assert.equal(s.setJSON('model-wave', ['parameters', 'gamma'], 0.2), false);
    assert.equal(s.html, source);
  }
});
test('documents without the current source sections are rejected instead of migrated', () => {
  assert.throws(
    () => SourceStore.fromHTML(fixture().replace('<!-- END MILO SLIDES -->\n', '')),
    /milo形式/,
  );
});
test('a parameter edit changes only its token; comments, formatting, assets, runtime remain exact', () => {
  for (const eol of ['\n', '\r\n']) {
    const source = fixture(eol),
      s = SourceStore.fromHTML(source);
    s.setJSON('model-wave', ['parameters', 'gamma'], 0.31);
    assert.equal(s.html, source.replace('"gamma": 0.2', '"gamma": 0.31'));
    const again = SourceStore.fromHTML(s.html!);
    assert.equal(json(again.get('model-wave').text).parameters.gamma, 0.31);
  }
});
test('codec round-trips dangerous HTML delimiters, literal entities, Unicode and NUL', () => {
  const texts = [
    '</script><script>alert(1)</script>',
    '<!-- <script> &lt; &amp;',
    'a < b && c > d',
    '日本語🧪𝒜\u0000\r\n',
    '&amp;lt;',
  ];
  for (const t of texts) {
    assert.equal(decode(encode(t)), t);
    const s = SourceStore.fromHTML(fixture());
    s.setText('slide-a', t);
    assert.equal(SourceStore.fromHTML(s.html!).get('slide-a').text, t);
  }
});
test('multiple source patches map decoded positions to encoded offsets without touching neighbors', () => {
  const s = SourceStore.fromHTML(fixture()),
    before = s.get('model-wave').text;
  s.setText('slide-a', '# 🧪 </script> &amp;');
  s.replace('slide-a', 5, 5, ' < ');
  s.setJSON('model-wave', ['parameters', 'omega'], 7);
  const parsed = SourceStore.fromHTML(s.html!);
  assert.equal(parsed.get('slide-a').text, s.get('slide-a').text);
  assert.equal(parsed.get('model-wave').text, before.replace('3.0', '7'));
  assert.match(s.html!, /const untouched = "A"/);
});
test('blocks can be added/removed and snapshots restored without DOM serialization', () => {
  const source = fixture(),
    s = SourceStore.fromHTML(source),
    snapshot = s.snapshot();
  s.add({ id: 'slide-b', kind: 'slide', name: 'B.md', text: '# B\n</script>' });
  s.remove('slide-a');
  assert.equal(SourceStore.fromHTML(s.html!).get('slide-b').text, '# B\n</script>');
  s.restore(snapshot);
  assert.equal(s.html, source);
});
test('new sources stay inside their readable kind section when group markers exist', () => {
  const html = readFileSync('dist/milo.html', 'utf8'),
    s = SourceStore.fromHTML(html),
    original = s.list('slide').map((b) => b.id);
  s.add({ id: 'slide-new', kind: 'slide', name: 'new.md', text: '# New' }, 'slide-02');
  s.add({ id: 'model-new', kind: 'model', name: 'new.jsonc', text: '{}' });
  assert.deepEqual(
    s.list('slide').map((b) => b.id),
    [original[0], 'slide-new', ...original.slice(1)],
  );
  s.moveBefore('slide-03', 'slide-02');
  assert.deepEqual(
    s.list('slide').map((b) => b.id),
    [original[0], 'slide-new', 'slide-03', 'slide-02', ...original.slice(3)],
  );
  assert.ok(s.html!.indexOf('id="slide-new"') < s.html!.lastIndexOf('<!-- END MILO SLIDES -->'));
  assert.ok(s.html!.indexOf('id="model-new"') > s.html!.lastIndexOf('<!-- END MILO SLIDES -->'));
  assert.ok(s.html!.indexOf('id="model-new"') < s.html!.lastIndexOf('<!-- END MILO MODELS -->'));
});
test('binding preserves the selected raw file, replays drafts, and rejects a mismatching file', () => {
  const full = SourceStore.fromHTML(fixture()),
    boot = full.snapshot();
  boot.html = null;
  boot.blocks = boot.blocks.map(({ id, kind, name, text }) => ({ id, kind, name, text }));
  const draft = new SourceStore(boot);
  draft.setJSON('model-wave', ['parameters', 'gamma'], 0.4);
  draft.attach(SourceStore.fromHTML(fixture()), boot);
  assert.equal(draft.html, fixture().replace('"gamma": 0.2', '"gamma": 0.4'));
  assert.throws(
    () => draft.attach(SourceStore.fromHTML(fixture().replace('3.0', '9.0')), boot),
    /異なります/,
  );
});
test('binding replays the physical slide order edited before a file handle is connected', () => {
  const html = readFileSync('dist/milo.html', 'utf8'),
    disk = SourceStore.fromHTML(html),
    original = disk.list('slide').map((b) => b.id),
    boot = disk.snapshot();
  boot.html = null;
  boot.blocks = boot.blocks.map(({ id, kind, name, text }) => ({ id, kind, name, text }));
  const draft = new SourceStore(boot);
  draft.moveBefore('slide-03', 'slide-02');
  draft.attach(SourceStore.fromHTML(html), boot);
  assert.deepEqual(
    draft.list('slide').map((b) => b.id),
    [original[0], 'slide-03', 'slide-02', ...original.slice(3)],
  );
  assert.deepEqual(
    SourceStore.fromHTML(draft.html!)
      .list('slide')
      .map((b) => b.id),
    [original[0], 'slide-03', 'slide-02', ...original.slice(3)],
  );
});
test('malformed JSONC stays editable but cannot drive a semantic patch', () => {
  const s = SourceStore.fromHTML(fixture());
  s.setText('model-wave', '{"parameters": {"gamma":');
  const html = s.html;
  assert.throws(() => s.setJSON('model-wave', ['parameters', 'gamma'], 1), /構文/);
  assert.equal(s.html, html);
  s.setText('model-wave', '{"parameters":{"gamma":0.2}}');
  assert.equal(json(SourceStore.fromHTML(s.html!).get('model-wave').text).parameters.gamma, 0.2);
});
test('expression precedence, right-associative powers and TeX agree', () => {
  const check = (s: string, v: number) =>
    assert.ok(Math.abs(evaluate(parseExpression(s), {}) - v) < 1e-10, s);
  check('-2^2', -4);
  check('2^3^2', 512);
  check('2^-2', 0.25);
  check('sin(pi/2)+sqrt(9)', 4);
  check('max(2,3)*cos(0)', 3);
  const ast = parseExpression('A * exp(-gamma * t) * cos(omega * t)');
  assert.equal(evaluate(ast, { A: 1, gamma: 0.2, t: 0, omega: 3 }), 1);
  assert.match(toTex(ast), /\\gamma/);
  assert.match(toTex(ast), /\\operatorname\{cos\}/);
  assert.match(toTex(parseExpression('(a^b)^c')), /\\left/);
});
test('expression language rejects JS access, unknown calls, partial expressions and unresolved variables', () => {
  for (const s of ['window.alert(1)', 'constructor(1)', 'x=1', 'sin(1,2)', 'exp(', '1 2', ''])
    assert.throws(() => parseExpression(s), s);
  assert.throws(() => evaluate(parseExpression('notDefined'), {}), /未定義/);
});

function fakeFile(initial: string) {
  let disk = initial;
  let writes = 0;
  let grant = 'granted';
  let fail = false;
  let beforeWrite: (() => void) | undefined;
  const h: FileHandle = {
    name: 'deck.html',
    queryPermission: async () => grant,
    getFile: async () => ({ arrayBuffer: async () => new TextEncoder().encode(disk).buffer }),
    createWritable: async () => {
      let staged = '';
      return {
        write: async (s) => {
          writes++;
          beforeWrite?.();
          if (fail) throw new Error('disk full');
          staged = s;
        },
        close: async () => {
          disk = staged;
        },
        abort: async () => {},
      };
    },
  };
  return {
    h,
    get disk() {
      return disk;
    },
    set disk(s: string) {
      disk = s;
    },
    get writes() {
      return writes;
    },
    set grant(s: string) {
      grant = s;
    },
    set fail(v: boolean) {
      fail = v;
    },
    set beforeWrite(fn: (() => void) | undefined) {
      beforeWrite = fn;
    },
  };
}
test('autosave writes the same handle and no-op does not write', async () => {
  const f = fakeFile('old');
  let current = 'old';
  const states: string[] = [];
  const save = new Autosaver(
    () => current,
    (s) => states.push(s),
  );
  save.bind(f.h, 'old');
  await save.flush();
  assert.equal(f.writes, 0);
  current = 'new';
  await save.flush();
  assert.equal(f.disk, 'new');
  assert.equal(save.state, 'saved');
  assert.ok(states.includes('saving'));
  save.dispose();
});
test('edits arriving during a write are not acknowledged as saved until the next write', async () => {
  const f = fakeFile('old');
  let current = 'a';
  const save = new Autosaver(
    () => current,
    () => {},
  );
  save.bind(f.h, 'old');
  f.beforeWrite = () => {
    current = 'b';
    f.beforeWrite = undefined;
  };
  await save.flush();
  assert.equal(f.disk, 'a');
  assert.equal(save.state, 'pending');
  assert.equal(save.dirty(), true);
  await save.flush();
  assert.equal(f.disk, 'b');
  assert.equal(save.state, 'saved');
  save.dispose();
});
test('external edits stop saving rather than overwriting the other writer', async () => {
  const f = fakeFile('old');
  let current = 'new';
  const save = new Autosaver(
    () => current,
    () => {},
  );
  save.bind(f.h, 'old');
  f.disk = 'git checkout';
  await save.flush();
  assert.equal(save.state, 'conflict');
  assert.equal(f.disk, 'git checkout');
  assert.equal(f.writes, 0);
  await save.retry();
  assert.equal(f.writes, 0);
  save.dispose();
});
test('failed writes and missing permissions never show saved or advance the disk baseline', async () => {
  const f = fakeFile('old');
  const save = new Autosaver(
    () => 'new',
    () => {},
  );
  save.bind(f.h, 'old');
  f.fail = true;
  await save.flush();
  assert.equal(save.state, 'error');
  assert.equal(save.baseline, 'old');
  assert.equal(f.disk, 'old');
  f.fail = false;
  await save.retry();
  assert.equal(save.state, 'saved');
  save.dispose();
  const g = fakeFile('old');
  g.grant = 'prompt';
  const other = new Autosaver(
    () => 'new',
    () => {},
  );
  other.bind(g.h, 'old');
  await other.flush();
  assert.equal(other.state, 'permission');
  assert.equal(g.writes, 0);
  other.dispose();
});
test('a failed post-write verification never advances the baseline until a retry verifies disk', async () => {
  let disk = 'old',
    reads = 0,
    writes = 0,
    failVerification = true;
  const handle: FileHandle = {
    name: 'deck.html',
    queryPermission: async () => 'granted',
    getFile: async () => ({
      arrayBuffer: async () => {
        reads++;
        if (failVerification && reads === 3) throw new Error('temporary read failure');
        return new TextEncoder().encode(disk).buffer;
      },
    }),
    createWritable: async () => {
      let staged = '';
      return {
        write: async (value) => {
          staged = value;
          writes++;
        },
        close: async () => {
          disk = staged;
        },
        abort: async () => {},
      };
    },
  };
  const save = new Autosaver(
    () => 'new',
    () => {},
  );
  save.bind(handle, 'old');
  await save.flush();
  assert.equal(save.state, 'error');
  assert.equal(save.baseline, 'old');
  assert.equal(disk, 'new');
  assert.equal(writes, 1);
  failVerification = false;
  await save.retry();
  assert.equal(save.state, 'saved');
  assert.equal(save.baseline, 'new');
  assert.equal(writes, 1);
  save.dispose();
});
test('built artifact contains one kernel and all dependencies; a model edit leaves it byte-identical', () => {
  const html = readFileSync('dist/milo.html', 'utf8'),
    s = SourceStore.fromHTML(html);
  assert.equal(s.list().length, 8);
  assert.equal(s.list('slide').length, 5);
  assert.equal(s.list('component').length, 0);
  assert.equal(/<script[^>]+\bsrc\s*=/i.test(html), false);
  assert.equal(/<link[^>]+rel="stylesheet"/i.test(html), false);
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  assert.equal(/url\((?!data:)/.test(styles), false);
  assert.equal(/data:font\/woff2;base64,/.test(styles), true);
  assert.equal(styles.includes('.component-block'), false);
  assert.equal((styles.match(/\.presenting \.slide\s*\{/g) ?? []).length, 1);
  assert.equal(styles.includes('.presenting .slide h1'), false);
  assert.equal(html.includes('id="third-party-notices"'), false);
  assert.match(s.get('slide-01').text, /<!-- milo: layout=cover -->/);
  assert.match(s.get('slide-01').text, /# 君とボク。/);
  assert.ok(s.get('slide-02').text.includes('@canvas'));
  assert.ok(s.get('slide-03').text.includes('{{wave.gamma}}'));
  assert.ok(s.get('slide-04').text.includes('./assets/flow.gif'));
  assert.ok(s.get('slide-05').text.includes('@impact'));
  assert.ok(s.get('slide-05').text.includes('- [ ]'));
  assert.equal(json(s.get('manifest').text).title, '小さな実験室');
  assert.equal(Object.hasOwn(json(s.get('manifest').text), 'layouts'), false);
  assert.equal(s.get('model-wave').name, 'wave.jsonc');
  assert.equal(s.list('asset')[0]?.name, 'assets/flow.gif');
  assert.equal(Object.hasOwn(json(s.get('manifest').text), 'slides'), false);
  assert.ok(html.indexOf('MILO TOOLBOX') < html.indexOf('MILO DOCUMENT'));
  assert.ok(html.indexOf('id="milo-runtime"') < html.indexOf('id="slide-01"'));
  assert.ok(html.indexOf('id="milo-launcher"') > html.indexOf('<!-- END MILO DOCUMENT -->'));
  assert.equal(html.includes('component-phase'), false);
  assert.equal(html.includes('部品を起動中'), false);
  s.setJSON('model-wave', ['parameters', 'gamma'], 0.3);
  assert.equal(s.html, html.replace('"gamma": 0.2', '"gamma": 0.3'));
});
