# milo

Markdown からスライドの HTML をビルドします。
生成後の使用には外部 CDN やサーバーへの接続は不要です。

## 使い方

Node.js (v22以降) をインストールして以下を実行します。

```sh
npm ci
npx milo talk.md
```

原稿は1つの Markdown で書けます。先頭の frontmatter にタイトルを、`milo:model` フェンスに数式モデルを、`![](./assets/photo.png)` に画像を置きます。

````markdown
---
title: 小さな実験室
description: 数式と図の実験
layouts: [cover, lab, media]
---

```milo:model wave
{
  "input": "t",
  "parameters": { "gamma": 0.2, "omega": 3.0 },
  "expression": "exp(-gamma * t) * cos(omega * t)"
}
```

# 表紙

---

減衰率は **{{wave.gamma}}**。

::plot{model="wave" from="0" to="10"}

---

![図](./assets/flow.gif)
````

`<パス>` は `.md` ファイルか、`slides.md` を含むディレクトリです。同じ場所の `models/` に置いた JSONC も追加で取り込みます。

```sh
npx milo content -o dist/milo.html
```

省略時の出力は Markdown と同じディレクトリの `<名前>.html` です。`-o` で変更できます。

生成された HTML をデスクトップ版 Chrome または Edge で開きます。
右上の「自動保存を接続」を押し、いま開いた HTML を選んで書き込みを許可します。

右側の原稿とモデルを編集します。入力が落ち着いてから約500msで同じファイルへ保存します。入力を続けている間も、おおむね2秒ごとに保存を試みます。
閉じる前に「保存済み」を確認してください。ブラウザや設定によって、再度ファイル選択や許可が必要な場合があります。

`Cmd+S` / `Ctrl+S` はブラウザの「ページを保存」ではなく、miloの即時保存として動きます。
未接続なら保存先の接続を開始します。
