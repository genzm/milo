---
title: Diagram regressions
---

<!-- milo: layout=lab -->

# 解像度を上げる4つの視点

@diagram layout=ring connect=none note=outside note-link=arrow geometry=regular width=1100 height=630
@item depth title="深さ" badge=1
症状から原因へ掘る。現場の事実に触れる。
@item breadth title="広さ" badge=2
他の原因・打ち手・視点を探す。
@item structure title="構造" badge=3
要素の関係・重要度・因果を見つける。
@item time title="時間" badge=4
歴史・変化・将来・プロセスを見る。
@enddiagram

@footer
原資料 p.11–17｜四つは順位ではなく異なる観察の切り口
@endfooter

---

<!-- milo: layout=lab -->

# 醤油の例：原因を広げ、重要なものを選ぶ

@diagram layout=flow direction=right route=auto width=1250
@item issue title="醤油がおいしくない"
顧客に見える症状
@item raw title="原料の質"
さらに分解できる
@item ferment title="発酵不足"
製造の問題候補
@item oxid title="酸化による劣化" level=high
保存過程にも着目
@item soy title="大豆"
@item wheat title="小麦"
@item salt title="食塩"
@link issue -> raw
@link issue -> ferment
@link issue -> oxid
@link raw -> soy
@link raw -> wheat
@link raw -> salt
@enddiagram

@footer
原資料 p.21–26｜醤油の原因候補を階層化。高い強調は原資料で選ばれた「酸化」
@endfooter

---

<!-- milo: layout=lab -->

# 競合比較：自社が「すべて勝つ」は疑ってみる

@diagram layout=field width=1280 height=620 guide=axes x-low="使いづらい" x-high="使いやすい" y-low="コスト安い" y-high="コスト高い"
@item c1 title="競合１" x=-0.67 y=0.48 level=medium
@item c2 title="競合２" x=0.57 y=0.48 level=medium
@item own title="自社" x=0.57 y=-0.52 level=high
@enddiagram

@footer
原資料 p.35–36｜比較軸と相対配置は原資料の模式図に基づく。数値座標は表示用
@endfooter

---

<!-- milo: layout=lab -->

# 広さ：一つの課題を、六つの入口から見直す

@diagram layout=radial center=issue width=1160 height=620
@item issue title="顧客の課題" level=high
@item question title="前提を疑う"
問いの型・異化
@item customer title="視座を変える"
顧客・上司の上司
@item experience title="競合を体験する"
他社製品を実際に使う
@item talk title="人と対話する"
違う立場の声を聞く
@item books title="本と事例を読む"
専門書・教科書・記事
@item words title="新しい言葉を得る"
知らない概念から再発見
@link issue -- question
@link issue -- customer
@link issue -- experience
@link issue -- talk
@link issue -- books
@link issue -- words
@enddiagram

@footer
原資料 p.75–79｜順序・優先順位ではなく視点の入口を表す
@endfooter

---

<!-- milo: layout=lab -->

# 構造の事例：「昼御飯の相手がいない」の因果網

@canvas layout=free direction=right width=1260 height=540 route=curve
@node dislike frame=20,46,250,100 tone=muted
### 友達が欲しくない
@node shared frame=20,374,250,108 tone=accent
### 共通の話題がない
@node nofriends frame=347,46,245,108
### そもそも友達がいない
@node noidea frame=347,374,245,108
### 何を話せばいいか分からない
@node nearby frame=674,46,245,108
### 近くに知り合いがいない
@node courage frame=674,374,245,108
### 他人に声をかける勇気がない
@node lunch frame=991,198,245,138 tone=dark
### 昼御飯の相手がいない
@edge dislike --> nofriends
@edge nofriends --> nearby
@edge nearby --> lunch
@edge shared --> noidea
@edge noidea --> courage
@edge courage --> lunch
@edge courage --> nofriends dashed=true tone=accent label="相互に影響"
@endcanvas

@footer
原資料 p.87–93｜原資料のコーザリティ分析を再配置。因果の線は検証すべき仮説
@endfooter
