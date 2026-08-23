# nja-osm-tags

[@geolonia/normalize-japanese-addresses](https://github.com/geolonia/normalize-japanese-addresses)（NJA）が分割した日本の住所階層を、OpenStreetMap の `addr:*` タグに変換します。

## ライセンス上の制約

対象は住居表示住所のみです。
地番方式の住所については、番地も地番由来の座標も出力しません。

日本の住所は2つの体系で解決されます。
住居表示方式は ABR（アドレス・ベース・レジストリ）由来で、NJA は `metadata.rsdt` に返します。
地番方式は `metadata.chiban` に返ります。
後者のデータは OSM に投入できないため、`metadata.chiban` が返った場合は `addr:block_number` と `addr:housenumber` を生成せずに落とします。
町字までの階層は ABR 由来なので出力します。

座標にも同じ制約をかけています。
`point.level === 8` は住居表示または地番の位置を意味し、実データ160件の確認では必ず `rsdt` か `chiban` のどちらかを伴いました。
そこで `extra.point` を出すのは `point.level !== 8` または `metadata.rsdt` が存在するときだけにしています。
地番の座標が制約の対象外だと確認できれば緩めてよい、保守的な措置です。

判定は `src/numbers.ts` の `decideNumbers` と `src/point.ts` の `isPointEmittable` の2箇所に集約してあります。
出力側では `numberSource` と `noNumberReason` で機械的に絞れます。

## 使い方

ライブラリとして呼びます。

```ts
import { addressToOsmTags } from './src/index.ts'

const r = await addressToOsmTags('東京都千代田区紀尾井町1-3')
// r.tags         -> { 'addr:country': 'JP', 'addr:province': '東京都', ... }
// r.numberSource -> 'verified'
```

`numberSource` は番地の根拠を示します。
`verified` は ABR の住居表示明細と照合済み、`inferred` は入力文字列から分解したもので未照合、`none` は番地を出していないことを意味します。
インポート用のデータを作るときは `verified` だけを採ることで、推定分を混ぜずに済みます。

CSV を一括変換します。

```bash
npm run batch -- --address-column 所在地 --lat-column 緯度 --lng-column 経度 input.csv > out.csv
```

元の列を保ったまま、`addr:*` 11列と備考5列（`_番地の根拠` `_備考` `_lat` `_lng` `_座標精度`）を足します。
分類による振り分けはしないので、`_番地の根拠` と `_備考` で絞ってください。

座標列を指定すると、値が `0.0` などで無効なとき NJA の代表点で補完し、精度レベルを `_座標精度` に入れます。
地番方式の住所では補完が効きません。

## 環境

Node.js v26 の型ストリッピングで `.ts` をそのまま実行します。
TypeScript 7 は型チェック専用（`noEmit`）です。

```bash
npm install
```

| コマンド | 内容 |
| --- | --- |
| `npm test` | vitest。NJA の住所データ API にアクセスするためネットワークが必要 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run normalize -- '<住所>'` | NJA の正規化結果を `metadata` 込みで出力する調査用 CLI |
| `npm run batch -- <オプション> <input.csv>` | CSV の一括変換 |
| `npm run fixtures` | テスト用フィクスチャの再生成。ネットワークが必要 |
| `npm run fixtures:chiban` | 地番方式フィクスチャの再生成。ネットワークが必要 |

## NJA が返す階層

タグ化に使えるのは `metadata` 側です。
トップレベルの `result.city` は政令市名と区名、郡名と町村名を連結するので使いません。
`result.town` も大字と丁目を連結します。

| 階層 | フィールド |
| --- | --- |
| 都道府県 | `metadata.prefecture.pref` / `pref_k` / `pref_r` / `code` |
| 郡 | `metadata.city.county` / `county_k` / `county_r` |
| 市区町村 | `metadata.city.city` / `city_k` / `city_r` / `code` |
| 政令市の区 | `metadata.city.ward` / `ward_k` / `ward_r` |
| 大字・町 | `metadata.machiAza.oaza_cho` / `oaza_cho_k` / `oaza_cho_r` |
| 丁目 | `metadata.machiAza.chome` / `chome_n` |
| 小字 | `metadata.machiAza.koaza` / `koaza_k` / `koaza_r` |
| 街区符号・住居番号 | `metadata.rsdt.blk_num` / `rsdt_num` / `rsdt_num2` |
| 地番 | `metadata.chiban.prc_num1` / `prc_num2` / `prc_num3` |

`level` は正規化がどこまで進んだかを示します（0 = 不明、1 = 都道府県、2 = 市区町村、3 = 町字、8 = 住居表示または地番）。
`other` に文字列が残っていれば、それは正規化しきれなかった残余です。

## 既知の限界

`bin/batch.ts` の例外処理は未テストです。
NJA は解決できない住所でも例外を投げず `level 0` を返すため、決定的に例外を起こす入力を作れていません。

`地割` が `addr:neighbourhood` に入ります。
OSM の公式サンプルは「第○地割は place に入れるのは不適」としていますが、NJA が `koaza` として返すため現状は入ります。
実データでの発生率は0.9%です。

住居表示未実施の町字では、解決できなかった番地が `note` タグに残ります。
その区域は地番で運用されているので実質的に地番ですが、値の出自が利用者の入力文字列であって地番データベースの参照結果ではないため、そのまま出力しています。
該当カテゴリの68%、全体の8.7%で発生します。

丁目の告示表記は大字側のカナからのみ復元できます。
大字に数字を含まない自治体（横浜市鶴見区朝日町、堺市堺区市之町西など）では漢数字になり、OSM の公式サンプルの期待値と食い違います。

## 参照

[docs/osm-tagging-spec.md](docs/osm-tagging-spec.md) に、正とする OSM のタグ体系と、NJA の各フィールドとの対応の検証結果があります。
