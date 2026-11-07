# 解説矢印と否定の×

`@compose` で図・ボックス・文章・画像をまとめ、`@arrow` と `@cross` を重ねられます。色は既存のアクセント、本文色、補助色です。書体やボックスの見た目も既存のものを使います。

6枚の実例は [examples/annotations.md](../examples/annotations.md) にあります。

```sh
node cli/milo.mjs examples/annotations.md -o dist/annotations.html
```

## ボックス間の大きな矢印

各まとまりを `@part 名前` と `@endpart` で囲みます。中には通常の Markdown、`@box`、`@diagram`、`@canvas` などを書けます。まとまりは中央に寄り、余った幅で矢印を引き伸ばしません。

```markdown
@compose gap=160 height=360
@part problem width=300
@box tone=accent
### 課題

うまくいかない
@endbox
@endpart
@part solution width=300
@box tone=dark
### 解決策

うまくいくようにする
@endbox
@endpart
@arrow id=proposal from=problem to=solution size=88
@endcompose
```

`@arrow` は通常の flow 接続線とは独立した解説要素です。名前で対象を指定し、実際の表示位置から接続点を計算します。対象の上下の範囲が重なるときは、水平な矢印になります。

| `@arrow` の指定 | 役割 |
| --- | --- |
| `from` と `to` | 対象同士を結ぶ |
| `from` と `to` と `side` | 2つの対象が決める層の外側に、平行な矢印を置く |
| `target` と `side` | 1つの対象の外側に、平行な矢印を置く |

`target` と `from` / `to` は同時に書けません。`side` だけ、または `from` だけも書けません。

| compose の設定 | 意味 |
| --- | --- |
| `layout=row` / `column` | 横並び / 縦並び。既定は row |
| `gap=140` | まとまり同士の間隔。大きな矢印の余白にもなる |
| `align=center` / `start` / `end` | 並ぶ方向に直交する軸の揃え方。row なら中央 / 上 / 下 |
| `height=360` | 内容領域の最小高さ。省略時は内容の高さ |

`@part` の `width` は希望幅です。全体に収まらないときは縮まります。省略すると通常の内容は320、図は560、単独の図は1100ピクセルを目安にします。`align=start` / `center` / `end` は part ごとにも指定できます。

## 両向きの矢印

トレードオフや相互作用には `arrows=both` を付けます。省略時は `arrows=end`（片向き）です。縦方向や図の外側に置く矢印でも使えます。

```markdown
@arrow id=trade from=exploit to=explore size=72 label="トレードオフ" arrows=both
```

ラベルは両端の矢じりを除いた中央に配置し、入りきらない場合は矢印の外側に表示します。[活用と探索の例](../examples/tradeoff.md) も参照してください。

## 2つのflowをつなぐ

それぞれの `@part` に独立した `@diagram layout=flow` を置き、`from=now to=future` のように結びます。`@compose align=start` にすると見出しを上で揃えられます。

横に2つ並べる図では、例えば次の設定を使えます。

```markdown
@diagram layout=flow width=560 gap=24 node-width=220
@item issue title="課題"
@item cause title="原因"
@link issue -> cause
@enddiagram
```

`gap` はノード間隔の希望値、`node-width` は全ノードの幅です。文字サイズは変えません。`gap` の既定は48、`node-width` の省略時は従来どおり自動計算です。分岐や接続点に必要な余白は配置処理が確保します。単純な flow は、図の幅を広げても中央にまとまり、接続線の長さを保ちます。

## 図に「深さ」「広さ」を重ねる

層の幅に合わせるときは、`from` と `to` と `side` を使います。1つのノードの幅だけに合わせたいときは `target` と `side` です。

```markdown
@arrow id=depth from=causes.issue to=causes.material side=top label="深さ"
@arrow id=breadth from=causes.a1 to=causes.a3 side=right label="広さ" tone=default
```

入口から枝Aなら、深さは入口の左端から枝Aの右端までの横矢印になります。枝Aから葉A1なら、葉A1の上に来ます。広さは常に図の右端で、始点と終点の高さをカバーします。

| `side` | 長さ | 位置 |
| --- | --- | --- |
| `top` / `bottom` | 始点と終点が決める左右の幅 | その幅に重なるノードを避けた、一番近い平行位置 |
| `right` / `left` | 始点と終点が決める上下の高さ | 図の右端 / 左端 |

`side` は top / right / bottom / left。top / bottom の既定方向は右、right / left は下です。`direction=left` / `up` で反転できます。`size` は矢印の太さ（既定64）、`offset` は対象からの距離（既定20）です。`direction` には `side` が必要で、`side` と平行な向きだけ書けます。

対象の名前は、その `@compose` の中で解決します。

| 指定 | 対象 |
| --- | --- |
| `causes` | `@part causes` 全体 |
| `causes.material` | その part 内の `@item material` または `@node material` |
| `all` | 全 part を囲む範囲 |

特定のノードから説明ボックスへ結ぶ場合は、`from=causes.store to=solution` とします。対象ノードと同じIDが part 内に複数ある場合は、part を分けて一意にしてください。

## 任意の対象を×で否定する

```markdown
@cross target=proposal size=300 label="このつながりだけでは解決しない"
@cross target=idea size=240 label="思い込みを否定"
```

`target` には part、part 内のノード、`all`、または `@arrow` の `id` を指定できます。文章・画像・ボックスも part で囲めば対象になります。`size` は×の横幅です。省略すると対象に合わせ、`scale`（既定1）で倍率を指定できます。`label` は読み上げ用の説明です。

矢印と×の `tone` は `accent`（既定）、`default`、`muted`。参照画像の青・黄・オレンジは持ち込まず、milo の色を使います。

## 表示の確認

編集画面、発表モード、PDFで同じ描画処理を使います。位置はDOMの実測から計算し、画面の拡縮・フォントや画像の読み込み・対象の寸法変更に追従します。

内容が多くてスライドから出る場合は、図の間隔、ノード幅、part の幅を調整するか、スライドを分けます。文字を自動で小さくはしません。存在しない対象や、矢印を置く余白がない指定は画面にエラーを表示します。

## 接続点の計算

構文は `src/markdown/composition.mjs`、重ねる処理は `src/composition/mount.ts`、点の計算は `src/composition/geometry.ts` です。図の再配置が終わったあと、DOM の実測から対象の枠を取ります。

| 関数 | 使い方 |
| --- | --- |
| `betweenBoxes` | `from` と `to`。上下の投影が重なるときは水平、左右が重なるときは垂直。重なりの中では、先に始点の中心、次に終点の中心、どちらも外れるときは重なりの中央 |
| `besideBox` | `target` と `side`。1つの枠の外側に、その辺と平行な矢印 |
| `besideSpan` | `from` と `to` と `side`。2つの枠が決める幅または高さの層の外側に、平行な矢印 |
| `arrowGeometry` | 太さ `size` の多角形。`arrows=both` のとき両端が矢じり |

余白が足りないときはエラーにします。拡縮は実測のたびにやり直すので、発表モードの拡大にも追従します。流れ図の接続線とは別物です。配置の本体は [流れ図](flow.md) と [図式](diagram.md) です。
