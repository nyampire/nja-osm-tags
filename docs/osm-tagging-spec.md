# 正とする仕様: OSM 日本の住所タグ体系

出典（この3つを正とする）:

- <https://wiki.openstreetmap.org/wiki/JA:Key:addr:*>
- <https://wiki.openstreetmap.org/wiki/JA:住所>
- [地名のタグ付け方法の例](https://docs.google.com/spreadsheets/d/1aOnXzGhZ8DYn0rSUXbT2C0JACesqfJbdpqiz2Jty8n0/edit)
  （取得済みスナップショット: [scripts/osm-japan-tagging-examples.csv](../scripts/osm-japan-tagging-examples.csv)）

## タグ体系

`*` は地域の体系によって省略されうる。

| タグ | 対応する住所要素 | admin_level |
| --- | --- | --- |
| `addr:country` | `JP` 固定 | |
| `addr:province` | 都道府県 | 4 |
| （対応キーなし） | 振興局 | 5 |
| `addr:county` * | 郡 | 6 |
| `addr:city` | 市 / 特別区(東京23区) / 町 / 村 | 7 |
| `addr:suburb` * | 区（政令指定都市の区） | 8 |
| `addr:quarter` * | 大字（**この下の字名が必須である場合にのみ使用**） | 9 |
| `addr:neighbourhood` * | 町 / 字 / 丁 / 丁目 | 10 |
| `addr:block_number` * | 街区符号 / 番 / 番地 / 地番（無番地の場合は `無番地`） | |
| `addr:housenumber` * | 住居番号 / 号 / 支号 / 枝番号 | |
| `addr:housename` * | 複合住宅・施設の名称 | |
| `addr:room` * | 部屋番号 | |
| `addr:floor` * | 階層 | |

## 2つの番号体系

JA:住所 より。番地部分の解釈が体系で変わる。

- **街区符号方式（住居表示実施済み）**: `addr:neighbourhood` に「○丁目」があり、
  続く `addr:block_number` が街区符号、`addr:housenumber` が住居番号。
- **地籍からの番号転用方式（地番）**: `addr:neighbourhood` は町・字、
  `addr:block_number` が番地・地番、`addr:housenumber` が枝番号。

`2-24-3` のような略記からの判別について wiki は「1つめの数字が2桁以上なら
かなり高い確率で地番」というヒューリスティクスを挙げるが、
**NJA はどちらの体系かを `metadata.rsdt` / `metadata.chiban` の
どちらが返るかで確定的に示すため、このヒューリスティクスは不要。**

## 特殊ケース（wiki 明記分）

- **無番地**: `addr:block_number = 無番地`
- **京都の通り名**: 街路名を含む住所は `addr:full` に格納し、他の階層も埋める
- **北海道の条丁目**: 条と丁目をまとめて町名として `addr:neighbourhood` に入れる

## NJA との対応（実データ検証済み）

`scripts/compare-sheet.ts` でスプレッドシート全40件を NJA v3.1.3 に流して突き合わせた結果。

### quarter / neighbourhood は機械的に決まる

`metadata.machiAza` の3フィールドで場合分けするだけで、表の期待値とほぼ全件一致する。

| NJA の状態 | `addr:quarter` | `addr:neighbourhood` |
| --- | --- | --- |
| `chome` あり | （空） | `oaza_cho` + `chome` |
| `koaza` あり | `oaza_cho` | `koaza` |
| どちらもなし | （空） | `oaza_cho` |

表が「例外ルール」「特殊な例外」と注記したケースも、NJA のフィールド構成が
そのまま正解になっている。

- 松戸市北松戸三丁目 — 表は「厳密には大字北松戸・小字三丁目だが例外ルールで
  neighbourhood」。NJA は `chome = 三丁目` として返すので上表で自然に一致。
- 郡山市安積町柴宮東 — 表は「特殊な例外」。NJA は `oaza_cho = 安積町` /
  `koaza = 字柴宮東` を持っており一致。
- 松戸市南花島中町 — 表は「?」付きの判断。NJA も `oaza_cho = 南花島中町` の
  一体なので一致。

### 決定: 「大字」「字」の表記は残す

NJA はデータ上の表記をそのまま返す（`大字藤崎`, `字西村井`）。
**この接頭辞は除去せず、そのまま出力する**（2026-08-21 決定）。

結果としてスプレッドシートの期待値とは差が出る。

| 住所 | NJA / 本ツールの出力 | 表の期待値 |
| --- | --- | --- |
| 藤崎町藤崎西村井 | quarter=`大字藤崎` / neighbourhood=`字西村井` | `藤崎` / `西村井` |
| 郡山市北畑 | neighbourhood=`字北畑` | `北畑` |
| 流山市鰭ケ崎 | neighbourhood=`大字鰭ケ崎` | `鰭ケ崎` |
| 長野市若里 | neighbourhood=`大字若里` | `若里` |

なお表にも `南郷大字中野`（コメント「「大字」を途中に含む例（省略できない）」）のように
接頭辞を保持する例があり、除去する場合は「先頭のみ」という例外規則が必要だった。
残す方針ならその例外は不要になる。

### 既知の不一致

| 住所 | 内容 |
| --- | --- |
| 丁目の数字表記 | NJA は必ず漢数字に正規化する（`江戸川台西4丁目` → `oaza_cho=江戸川台西` `chome=四丁目`、`西19条南42丁目` → `西十九条南` `四十二丁目`）。表は告示どおりの算用数字を期待。**NJA の情報だけでは告示表記を復元できない。** |
| 長野市大字鶴賀権堂町 | 表は quarter=鶴賀 / neighbourhood=権堂町。NJA は `oaza_cho=大字鶴賀` のみで、権堂町は `other` に残る（登記のみで使われる通称地名） |
| 龍ケ崎市寺後 | 表は neighbourhood=寺後。NJA は町字を特定できず `other=寺後` |
| 久慈市夏井町夏井第3地割 | 表は「第○地割は place に入れるのは不適」として neighbourhood=夏井町夏井 とし、`3-57-1` を番地側に含める。NJA は `koaza=第３地割`（全角数字）を返すので、上表の規則をそのまま当てると表と食い違う |
