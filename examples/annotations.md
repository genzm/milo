---
title: 解説矢印と図の組み合わせ
documentId: milo-annotations-examples
---

# 深さと広さを、図に重ねる

原因を掘り下げる方向と、候補を広げる方向を示す。

@compose
@part causes width=1120
@diagram layout=flow width=1120 direction=right gap=24 node-width=220
@item issue title="醤油がおいしくない"
@item raw title="原料の質"
@item ferment title="発酵が不十分"
@item oxid title="酸化による劣化"
@item soy title="大豆の質"
@item wheat title="小麦の質"
@item salt title="食塩の質"
@link issue -> raw
@link issue -> ferment
@link issue -> oxid
@link raw -> soy
@link raw -> wheat
@link raw -> salt
@enddiagram
@endpart
@arrow id=depth target=causes.raw side=top label="深さ"
@arrow id=breadth target=causes side=right label="広さ" tone=default
@endcompose

---

# 時間軸で、2つの図をつなぐ

今の課題が、将来も同じ課題とは限らない。

@compose gap=160 align=start
@part now width=560
## 今の課題

@diagram layout=flow width=560 direction=right gap=24 node-width=220
@item issue title="醤油がおいしくない"
@item raw title="原料の質"
@item ferment title="発酵が不十分"
@item oxid title="酸化による劣化"
@link issue -> raw
@link issue -> ferment
@link issue -> oxid
@enddiagram
@endpart
@part future width=560
## 5年後の課題

@diagram layout=flow width=560 direction=right gap=24 node-width=220
@item issue title="醤油がおいしくない"
@item raw title="原料の質"
@item ferment title="発酵が不十分"
@item oxid title="酸化による劣化"
@item diet title="食事の傾向が変わる" level=high
@link issue -> raw
@link issue -> ferment
@link issue -> oxid
@link issue -> diet
@enddiagram
@endpart
@arrow id=time from=now to=future label="時間" size=76
@endcompose

---

# 原因から、具体的な解決策へ

注目した原因と、その原因に効く打ち手を結ぶ。

@compose gap=160
@part causes width=560
@diagram layout=flow width=560 direction=right gap=24 node-width=220
@item issue title="醤油がおいしくない"
@item raw title="原料の質"
@item ferment title="発酵が不十分"
@item oxid title="酸化による劣化" level=high
@link issue -> raw
@link issue -> ferment
@link issue -> oxid
@enddiagram
@endpart
@part solution width=320 align=end
@box tone=accent
### 容器を工夫する

酸化を防ぎ、おいしさを保つ。
@endbox
@endpart
@arrow id=solve from=causes.oxid to=solution size=76
@endcompose

---

# ボックスと矢印を、中央にまとめる

余白を保ち、課題と解決策の関係を短く示す。

@compose gap=160 height=360
@part problem width=300
@box tone=accent
### 課題

醤油がおいしくない
@endbox
@endpart
@part solution width=300
@box tone=dark
### 解決策

おいしい醤油を作る
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

醤油がおいしくない
@endbox
@endpart
@part solution width=300
@box tone=muted
### 解決策

おいしい醤油を作る
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

すべての競合に勝てる。
@endbox
@endpart
@part evidence width=400
### 比較の軸を見直す

顧客が選ぶ理由と、自社の強みを具体的に確かめる。
@endpart
@cross target=idea size=240 label="思い込みを否定"
@endcompose
