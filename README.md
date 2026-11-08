# milo

Markdown から、オフラインで開ける単一 HTML のスライドを作ります。

## 使い方

Node.js v22 以降で次を実行します。

```sh
npm ci
npm link
milo talk.md
```

`<パス>` は `.md` か、`slides.md` を含むディレクトリです。出力は Markdown と同じ場所の `<名前>.html` で、`-o` で変更できます。

```sh
milo content -o dist/milo.html
```

生成した HTML をデスクトップ版 Chrome または Edge で開きます。右上の「自動保存を接続」で、その HTML を選んで書き込みを許可してください。右側の原稿を編集すると、入力が止まって約 500ms 後に保存します。入力中も約 2 秒ごとに保存を試みます。`Cmd+S` / `Ctrl+S` は即時保存です。閉じる前に「保存済み」を確認してください。

## PDFを同時出力

PDFを作る場合だけ、PlaywrightのChromiumを導入します。

```sh
npx playwright install chromium
milo content --pdf -o dist/slides.html
```

`dist/slides.html` と `dist/slides.pdf` を生成します。通常のHTML出力にはChromiumは不要です。
PDFはスライド1枚につき1ページで、寸法は `src/slide-size.json` に従います。
HTMLと同じレンダラー・CSS・フォントを使い、編集UIは含みません。

チェックリストは原稿の状態で表示します。
GIFは印刷時の静止フレームになります。PDFの基準はコンパイル時点のMarkdownで、
生成後にHTML内で編集した内容は反映されません。PDF出力に失敗した場合も、生成済みのHTMLは残ります。

## 原稿

先頭の frontmatter にタイトル、各スライド先頭のコメントにレイアウトを書きます。レイアウトは `cover`、`section`、`lab`、`media`、`essay` です。

```markdown
---
title: 小さな実験室
description: 数式と図の実験
---

<!-- milo: layout=cover -->

# 表紙

---

<!-- milo: layout=lab -->

数式は $E = mc^2$ のように書けます。

$$
f(t) = A e^{-\gamma t} \cos(\omega t)
$$

---

<!-- milo: layout=media -->

![図](./assets/flow.gif)
```

## 記法

- 数式は `$...$`（文中）か `$$...$$`（独立した行）で書けます。グラフは画像として貼り付けます。
- `**太字**` は本文色、`==語句==` はアクセント色です。
- `@impact` から `@endimpact` は、短いメッセージを大きく表示します。
- 見出しと段落の末尾に `@align=center` または `@align=right` を付けると、その行を揃えます。省略時は左寄せです。
- 箇条書きの `[ ]` と `[x]` は、クリックできるチェック項目です。状態は原稿に保存されます。
- `@columns` の中に `@column` を置くと、等幅の列になります。
- `@grid` は子要素を同じ高さの列に並べます。`columns=2` で列数を指定できます。
- `@stack` は子要素を縦に隙間を空けて重ねます。
- `@panel` と `@box` は角丸カードです。`tone` は `muted`（グレー）、`default`（白）、`accent`（ピンクの輪郭）、`dark` です。広い面は白とグレー、ピンクは強調に使います。
- `@steps highlight=2` は番号付きの横並びです。いまのステップだけ番号がピンクになります。囲いは使いません。
- `@canvas` は、`-->` で区切ったまとまりを矢印でつなぎます。分岐するときは `@node` と `@edge` を使います。`layout=flow` は関係から配置し、`layout=free` は座標指定のままです。`direction` は `right` / `left` / `down` / `up` です。`route` を省略すると `auto` になり、直列は直線、分岐・合流は共有幹線付きの直交線になります。`curve` / `straight` / `elbow` も使えます。`height` を省略するか `height=auto` にすると内容に合わせて伸び、`height=480` のように数値を書くとその高さを維持してはみ出しを警告します。
- `@diagram` は要素と関係を宣言し、配置だけ切り替えます。`layout=flow` も同じ高さの指定と `route` を使います。`layout=ring` は項目数で三角形や四角形になり、`connect=cycle` で頂点を線で結びます。`@link a -- b` は関係、`a -> b` は方向、`a <-> b` は双方向です。`level=high|medium|low` は評価で、色はテーマが決めます。`note=outside` は頂点を動かさず、枠なしの説明を外側に置き、細い矢印でつなぎます。

```markdown
@diagram layout=ring connect=cycle
@item access title="誰でも引ける" badge=1 level=high
@item speed title="速く引ける" badge=2 level=high
@item history title="遡って引ける" badge=3 level=low
@enddiagram
```

```markdown
@diagram layout=ring connect=none note=outside
@item clear title="明確" badge=1 level=high
具体的に話せる
@item concise title="簡潔" badge=2 level=high
重要点を短く話せる
@item unique title="ユニーク" badge=3 level=high
独自の洞察がある
@enddiagram
```

```markdown
@diagram layout=flow direction=right
@item in title="入力"
@item analyze title="分析"
@item judge title="判断"
@item run title="実行"
@link in -> analyze
@link analyze -> judge
@link judge -> run
@enddiagram
```

```markdown
@diagram layout=flow direction=right route=auto
@item start title="入力"
@item a title="経路A"
@item b title="経路B"
@item join title="統合"
@link start -> a
@link start -> b
@link a -> join
@link b -> join
@enddiagram
```

横に収まらないときは `direction=down` を明示します。循環は戻り線になり、ノードを不規則に並べ直しません。

`layout=radial` に `side` と `distance` を付けると、中心からの方向と距離を宣言できます。`layout=field` は `-1` から `1` の意味座標で分布図を描きます。`@zone` は領域、`cluster=` は所属です。

```markdown
@diagram layout=field guide=axes x-low="内部" x-high="外部" y-low="短期" y-high="長期"
@item a title="施策A" x=-0.7 y=0.6
@item b title="施策B" x=0.5 y=0.4
@item c title="施策C" x=0.8 y=-0.6
@enddiagram
```

```markdown
@steps highlight=2
@step title="考え方"
目的と制約
トレードオフ・決め方
@step title="3つのケース"
アプリ / セキュリティ / Runnerログ
@step title="まとめ"
全体像と持ち帰ってほしいこと
@endsteps
```

## 見た目

文字サイズ、余白、色は `src/styles/tokens.css` です。スライドの寸法は `src/slide-size.json` の 1600×900 です。

```css
--slide-text-body: 27px;
--slide-leading-body: 1.75;
--slide-radius-ratio: 12%;
```

`npm run build` で単一 HTML と Marp テーマを再生成します。`marp/milo.css` は生成物なので、直接編集しません。

ビルドは `cli/build.mjs` でまとめて実行し、CSSとフォント定義を両方の出力で共有します。フォント処理は `cli/fonts.mjs` にあります。

記法の一覧、編集画面、単一HTMLの構造、開発時に直す場所は [docs](docs/README.md) にあります。
