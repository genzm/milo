import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '../../cli/compile.mjs';

let pending;
// Build once per test worker from current sources, independent of local dist output.
export function testDeckHtml() {
  return (pending ??= (async () => {
    const dir = await mkdtemp(join(tmpdir(), 'milo-test-deck-'));
    try {
      const result = await compile({
        input: fileURLToPath(new URL('../../content', import.meta.url)),
        out: join(dir, 'slides.html'),
      });
      return result.html;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  })());
}
