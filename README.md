# nja-osm-tags

[@geolonia/normalize-japanese-addresses](https://github.com/geolonia/normalize-japanese-addresses) (NJA)
で分割した日本の住所階層を、OpenStreetMap の `addr:*` タグ形式に変換する。

## 環境

- Node.js v26 (`.ts` をそのまま実行できる型ストリッピングを利用)
- TypeScript 7 は型チェック専用 (`noEmit`)

```bash
npm install
```

## コマンド

| コマンド | 内容 |
| --- | --- |
| `npm run normalize -- '<住所>'` | NJA の正規化結果 (`metadata` 込み) をそのまま出力する調査用 CLI |
| `npm run batch -- --address-column <列名> <input.csv>` | CSV を一括変換して addr:* 列と備考列を足す |
| `npm run fixtures` | テスト用フィクスチャを再生成（ネットワーク必要） |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | vitest (NJA の住所データ API にアクセスするためネットワークが必要) |

## NJA が返す階層

`normalize()` の戻り値のうち、タグ化に使えるのは主に `metadata` 側。

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

`level` は正規化がどこまで進んだかを示す (0=不明, 1=都道府県, 2=市区町村, 3=町字, 8=住居表示/地番)。
`other` に文字列が残っている場合は正規化しきれなかった残余。

## 使い方

```ts
import { addressToOsmTags } from './src/index.ts'

const r = await addressToOsmTags('東京都千代田区紀尾井町1-3')
// r.tags        -> { 'addr:country': 'JP', 'addr:province': '東京都', ... }
// r.numberSource -> 'verified'
```

住居表示住所のみを対象とし、地番方式の住所については番地を出力しません。
詳細は [設計書](docs/superpowers/specs/2026-08-22-nja-osm-tags-design.md) を参照。
