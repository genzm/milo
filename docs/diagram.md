# 図式の配置

`@diagram` は要素と関係を宣言し、`layout` で置き方だけ切り替えます。解析は `src/diagram/parse.ts`、振り分けは `src/diagram/layout.ts` です。DOM と実測は `src/diagram/mount.ts` です。計算は描画に依存しません。テストは見積もり寸法だけで再現できます。

| layout | 実装 | 既定の領域 |
| --- | --- | --- |
| `ring` | `layout-ring.ts` | 1000×500 |
| `radial` | `side` も `distance` も無ければ `layout-classic-radial.ts`、どちらかがあれば `layout-radial.ts` | 1040×580 |
| `field` | `layout-field.ts` | 1280×580 |
| `flow` | キャンバスと同じ [流れ図](flow.md) | 1280×560 |

`@panel` や `@column` の中で `width` / `height` の無い ring / radial は 640×512 です。全画面用の横長のままだと、円が短辺だけで小さく見えるためです。

辺の解決は `src/diagram/links.ts` です。`connect=cycle` は、まだ無い隣同士に無方向の辺を足します。radial では中心を除きます。すでに方向付きの辺がある組には足しません。

## ring

項目数 n の正多角形です。中心は領域の中央、半径は頂点が枠に収まる最大です。`start` が最初の頂点の方位、`order` が回る向きです。頂点は固定半径の円です。

ラベルは頂点の外側、法線方向に置きます。`note=outside` の説明も同じ向きに積み、頂点は動かしません。重なりと枠からはみ出しを、次の順で解消します。

1. 半径を少しずつ縮める
2. 説明の最大幅を縮める
3. 外側へ押し出す
4. 接線方向へずらして頂点や他の説明、弦を避ける

それでも残るときは overflow です。説明から頂点へは、一番近い辺上の点まで細い線を引きます。

## radial

最初の `@item`、または `center=` が中心です。周囲はカードです。

`side` も `distance` も無いときは、周囲をリング上に等角で置き、カード同士が重ならない最小半径を取ります。横方向だけ領域に合わせて伸ばします。枠に収まらないときは全体を縮小し、文字が読めない縮尺なら overflow です。

`side` または `distance` が1つでもあるときは、意味座標で置きます。`side` は上下左右、`distance` は near / mid / far です。書かなかった周囲は `start` と `order` のリングに戻します。同じ方向に複数あるときは、その半径上で角度を分けます。分けきれないときは overflow（`overlap`）です。縮小しすぎも overflow（`read`）です。

`connect=cycle` は周囲だけを結びます。中心への線は `@link` で書きます。線はカプセルの輪郭に付けます。

## field

項目の `x` / `y` は -1 から 1 の意味座標です。表示座標への変換は `src/diagram/spatial.ts` です。y の正は上です。

点は小さな円と外側ラベル、カードは座標の中心に置きます。線は輪郭から輪郭です。`guide=axes` は原点で交差する軸です。

`@zone` は意味座標の矩形です。`@cluster` は所属の色と凡例です。`cluster-region=halo` は所属点の凸包に近い輪を描きます。別の所属の点を飲み込む輪は描かず、overflow にします。
