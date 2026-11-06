---
title: 解説矢印と図の組み合わせ
documentId: milo-annotations-examples
---

# 深さと広さを、図に重ねる

掘り下げる方向と、広げる方向を示す。

@compose
@part causes width=1120
@diagram layout=flow width=1120 direction=right gap=24 node-width=220
@item issue title="入口"
@item material title="枝A"
@item process title="枝B"
@item store title="枝C"
@item a1 title="葉A1"
@item a2 title="葉A2"
@item a3 title="葉A3"
@link issue -> material
@link issue -> process
@link issue -> store
@link material -> a1
@link material -> a2
@link material -> a3
@enddiagram
@endpart
@arrow id=depth from=causes.issue to=causes.material side=top label="深さ"
@arrow id=breadth from=causes.a1 to=causes.a3 side=right label="広さ" tone=default
@endcompose

---

# 時間軸で、2つの図をつなぐ

今の課題が、後も同じ課題とは限らない。

@compose gap=160 align=start
@part now width=560
## 今の課題

@diagram layout=flow width=560 direction=right gap=24 node-width=220
@item issue title="入口"
@item material title="枝A"
@item process title="枝B"
@item store title="枝C"
@link issue -> material
@link issue -> process
@link issue -> store
@enddiagram
@endpart
@part future width=560
## 後の課題

@diagram layout=flow width=560 direction=right gap=24 node-width=220
@item issue title="入口"
@item material title="枝A"
@item process title="枝B"
@item store title="枝C"
@item extra title="枝D" level=high
@link issue -> material
@link issue -> process
@link issue -> store
@link issue -> extra
@enddiagram
@endpart
@arrow id=time from=now to=future label="時間" size=76
@endcompose

---

# 選んだ枝から、具体的な打ち手へ

注目した枝と、その枝に効く対応を結ぶ。

@compose gap=160
@part causes width=560
@diagram layout=flow width=560 direction=right gap=24 node-width=220
@item issue title="入口"
@item material title="枝A"
@item process title="枝B"
@item store title="枝C" level=high
@link issue -> material
@link issue -> process
@link issue -> store
@enddiagram
@endpart
@part solution width=320 align=end
@box tone=accent
### 対応

選んだ枝に効く打ち手。
@endbox
@endpart
@arrow id=solve from=causes.store to=solution size=76
@endcompose

---

# ボックスと矢印を、中央にまとめる

余白を保ち、課題と解決策の関係を短く示す。

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

---

# そのつながりを、問い直す

安易な解決策だけでは、良い打ち手にたどり着けない。

@compose gap=200 height=360
@part problem width=300
@box tone=muted
### 課題

うまくいかない
@endbox
@endpart
@part solution width=300
@box tone=muted
### 解決策

うまくいくようにする
@endbox
@endpart
@arrow id=proposal from=problem to=solution size=88 tone=muted
@cross target=proposal size=300 label="このつながりだけでは解決しない"
@endcompose

---

# 否定する対象は、図だけではない

文章・画像・ボックスも、同じ記法で対象にできる。

@compose gap=160 height=360
@part idea width=320
@box tone=muted
### 思い込み

これで足りる。
@endbox
@endpart
@part evidence width=400
### 前提を見直す

根拠を具体的に確かめる。
@endpart
@cross target=idea size=240 label="思い込みを否定"
@endcompose
