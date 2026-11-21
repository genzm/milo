import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locateLine } from '../cli/check.mjs';

test('a figure label points at its source line, not the slide title', () => {
  const slide = [
    '# 図が収まらない',
    '',
    '@diagram layout=radial center=problem',
    '@item problem title="中心"',
    '@item a title="非常に長いカードA" side=top distance=near',
  ].join('\n');
  assert.equal(
    locateLine(slide, 47, '非常に長いカードA', '同じ方向のカードが重なっています'),
    51,
  );
  assert.equal(locateLine(slide, 47, '中心', '同じ方向のカードが重なっています'), 50);
});

test('a render error points at the line named by its message', () => {
  const slide = [
    '# 記法と画像の誤り',
    '',
    '@box tone=purple',
    '色の指定が誤っている',
    '@endbox',
    '',
    '![外部の画像](https://example.com/missing.png)',
  ].join('\n');
  assert.equal(
    locateLine(slide, 65, undefined, 'boxのtoneは accent / default / muted / dark から選んでください。'),
    67,
  );
  assert.equal(
    locateLine(slide, 65, undefined, '埋め込み画像が見つかりません: https://example.com/missing.png'),
    71,
  );
});

test('authored text keeps its line when the message is not in the source', () => {
  const slide = ['# 下にはみ出す', '', '- 最後に見えない項目'].join('\n');
  assert.equal(locateLine(slide, 17, '最後に見えない項目', '本文が下に49pxはみ出しています'), 19);
  assert.equal(locateLine(slide, 17, undefined, '原稿のどこにも無い説明です'), 17);
});
