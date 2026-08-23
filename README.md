# nja-osm-tags

[@geolonia/normalize-japanese-addresses](https://github.com/geolonia/normalize-japanese-addresses)（NJA）が分割した日本の住所階層を、OpenStreetMap の `addr:*` タグに変換する。

対象は住居表示住所のみ。
地番方式の住所については、番地と地番由来の座標を出力しない。
ライセンス上の制約で、理由と適用範囲は[設計書](docs/superpowers/specs/2026-08-22-nja-osm-tags-design.md)に書いてある。

## 使い方

ライブラリとして呼ぶ。

```ts
import { addressToOsmTags } from './src/index.ts'

const r = await addressToOsmTags('東京都千代田区紀尾井町1-3')
// r.tags         -> { 'addr:country': 'JP', 'addr:province': '東京都', ... }
// r.numberSource -> 'verified'
```

`numberSource` は番地の根拠を示す。
`verified` は ABR の住居表示明細と照合済み、`inferred` は入力文字列から分解したもので未照合、`none` は番地を出していない。
インポート用のデータを作るときは `verified` だけを採ることで、推定分を混ぜずに済む。

CSV を一括変換する。

```bash
npm run batch -- --address-column 所在地 --lat-column 緯度 --lng-column 経度 input.csv > out.csv
```

元の列を保ったまま、`addr:*` 11列と備考5列（`_番地の根拠` `_備考` `_lat` `_lng` `_座標精度`）を足す。
分類による振り分けはしないので、`_番地の根拠` と `_備考` で絞る。

座標列を指定すると、値が `0.0` などで無効なとき NJA の代表点で補完し、精度レベルを `_座標精度` に入れる。
地番方式の住所では補完が効かない。

## 環境

Node.js v26 の型ストリッピングで `.ts` をそのまま実行する。
TypeScript 7 は型チェック専用（`noEmit`）。

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

タグ化に使えるのは `metadata` 側。
トップレベルの `result.city` は政令市名と区名、郡名と町村名を連結するので使わない。
`result.town` も大字と丁目を連結する。

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

`level` は正規化がどこまで進んだかを示す（0 = 不明、1 = 都道府県、2 = 市区町村、3 = 町字、8 = 住居表示または地番）。
`other` に文字列が残っていれば、それは正規化しきれなかった残余。

## 文書

| 文書 | 内容 |
| --- | --- |
| [docs/osm-tagging-spec.md](docs/osm-tagging-spec.md) | 正とする OSM のタグ体系と、NJA との対応の検証結果 |
| [docs/nja-coverage.md](docs/nja-coverage.md) | 実データ6万件での番地解決カバレッジの計測 |
| [設計書](docs/superpowers/specs/2026-08-22-nja-osm-tags-design.md) | 設計判断とその理由、既知の限界 |
| [実装計画](docs/superpowers/plans/2026-08-22-nja-osm-tags.md) | タスク分割と各タスクのコード |
