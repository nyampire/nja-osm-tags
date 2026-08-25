# nja-osm-tags

[@geolonia/normalize-japanese-addresses](https://github.com/geolonia/normalize-japanese-addresses)（NJA）のラッパーです。
NJA が分割した日本の住所階層を、OpenStreetMap の `addr:*` タグに翻訳します。

住所の解析そのものは NJA が行います。
このリポジトリがやるのは、NJA の出力を OSM のタグ体系に対応づけることだけです。
どのフィールドをどのタグに割り当てるか、複数の解釈がありうる場合にどちらを採るか、ライセンス上出力してはいけないものをどこで落とすか、という判断を担います。

```
住所文字列 ──NJA──> 階層に分割された構造 ──このリポジトリ──> addr:* タグ
```

## 要件

**Node.js v26 以上が必要です。**
型ストリッピングで `.ts` を直接実行するため、v22 や v24 では動きません。
TypeScript 7 は型チェック専用（`noEmit`）で、ビルド成果物は作りません。

**既定ではネットワークが必要です。**
NJA は住所データを `japanese-addresses-v2.geoloniamaps.com` から取得します。
1住所あたり1回以上のリクエストが発生します。
手元にデータを構築して `NJA_API_BASE` を向ければ、ネットワークなしで動きます（[docs/local-mirror.md](docs/local-mirror.md)）。

**逐次実行なので大量データは時間がかかります。**
バッチ変換は1行ずつ NJA を呼びます。
API 経由の実測は1,000件で20分前後でした。
件数に比例させると6万件で20時間ですが、線形とは限りません。
リクエスト数の下限は「1 + 自治体数 + 明細を持つ町字の数」で決まり、住所が地理的に散らばるほど上がります。
ローカルミラーを使った場合の実測はまだ取っていません。

## 導入

npm には公開していません。
clone して使います。

```bash
git clone https://github.com/nyampire/nja-osm-tags.git
cd nja-osm-tags
npm install
npm test
```

## 使い方

住所1件を変換します。

```ts
import { addressToOsmTags } from './src/index.ts'

const r = await addressToOsmTags('東京都千代田区紀尾井町1-3')
```

出力はこうなります。

```
入力  東京都千代田区紀尾井町1-3

tags          addr:country=JP  addr:province=東京都  addr:city=千代田区
              addr:neighbourhood=紀尾井町  addr:block_number=1  addr:housenumber=3
numberSource  verified
extra.point   { lat: 35.679107172, lng: 139.736394597, level: 8 }
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
地番の位置（`point.level === 8` かつ地番方式）は補完に使いません。

`--format geojson` を付けると FeatureCollection を出します。

```bash
npm run batch -- --address-column 所在地 --lat-column 緯度 --lng-column 経度 --format geojson input.csv > out.geojson
```

CSV との違いは3点です。
元の列とタグは `properties` に入り、値が空のタグは省かれます。
座標は `[経度, 緯度]` の順で `geometry` に入ります。
座標が決まらない行は `geometry` を `null` にして残します（RFC 7946 が認める形）。

```json
{
  "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [139.736, 35.679] },
  "properties": {
    "ID": "1",
    "addr:city": "千代田区",
    "addr:neighbourhood": "紀尾井町",
    "addr:block_number": "1",
    "addr:housenumber": "3",
    "_番地の根拠": "照合済み"
  }
}
```

補完の判定は `resolveCoord` の1箇所だけです。
CSV と GeoJSON で挙動が食い違うことはありません。

API の詳細は [docs/api.md](docs/api.md) にあります。

## 住所データの取得先

既定では Geolonia の API を使います。
環境変数 `NJA_API_BASE` を設定すると、そこを読みます。

```bash
export NJA_API_BASE=.data/japanese-addresses-v2/out/api/ja
```

パスでも URL でも受けます。
大量のデータを処理して API の負荷を避けたい場合は、手元に `japanese-addresses-v2` を構築してここを向けてください。
構築手順と注意点は [docs/local-mirror.md](docs/local-mirror.md) にあります。

適用した取得先は stderr に1行出るので、長時間のバッチでも API を叩いていないことを確認できます。

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

## コマンド

| コマンド | 内容 |
| --- | --- |
| `npm test` | vitest。341件のうち16件がネットワークを使う |
| `npm run test:watch` | vitest のウォッチモード |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run normalize -- '<住所>'` | NJA の正規化結果を `metadata` 込みで出力する調査用 CLI |
| `npm run batch -- <オプション> <input.csv>` | CSV の一括変換。`--format geojson` で GeoJSON 出力 |
| `npm run fixtures` | テスト用フィクスチャの再生成 |
| `npm run fixtures:chiban` | 地番方式フィクスチャの再生成。`sample/` が必要 |

## 開発

全341件のうち318件はネットワークを使いません。

| 区分 | 件数 | 対象 |
| --- | --- | --- |
| ネットワーク不要 | 318 | `test/fixtures/` に固定した NJA の実結果を使う |
| ネットワークが必要 | 16 | `index.test.ts` `nja.setup.test.ts` `batch.test.ts` |
| ローカルミラーが必要 | 7 | `local-mirror.test.ts`。ミラーが無い環境では skip |

主要なものを挙げます。

ライセンス境界のテストは `test/license-boundary.test.ts` に独立させ、地番方式のフィクスチャ100件で番地と座標が出力されないことを検証します（111件）。
仕様回帰のテストは OSM 公式のタグ付け例40件を期待値として固定します（42件）。
バッチ CLI の行単位エラー処理は `test/batch-error.test.ts` で検証します。
`addressToOsmTags` を差し替えて例外を投げさせるので、ネットワークを使いません。
取得先の切り替えは `test/apiBase.test.ts` で検証し、`normalize` を呼ぶファイルが全て `applyApiBase` を通っているかも併せて検査します。

`vitest.config.ts` で対象を `test/` に限定しています。
既定の設定では `.data/` に構築した `japanese-addresses-v2` のテストまで拾い、そちらが相対パスの `out/` に地番データを書き出してしまうためです。

**フィクスチャは NJA v3.1.3 の出力を固定しています。**
NJA を上げると期待値が変わる可能性があるので、`npm run fixtures` で再生成してから差分を確認してください。

`scripts/measure-coverage.ts` と `scripts/make-chiban-fixtures.ts` は `sample/` 配下の入力 CSV を必要とします。
容量が大きいため gitignore しており、リポジトリには含まれません。

## 文書

| 文書 | 内容 |
| --- | --- |
| [docs/api.md](docs/api.md) | 公開 API と型の一覧 |
| [docs/osm-tagging-spec.md](docs/osm-tagging-spec.md) | 正とする OSM のタグ体系と、NJA との対応の検証結果 |
| [docs/known-limitations.md](docs/known-limitations.md) | 既知の限界 |
| [docs/local-mirror.md](docs/local-mirror.md) | 住所データを手元に構築して API を使わずに動かす手順 |

## ライセンス

このリポジトリのコードは MIT ライセンスです（[LICENSE](LICENSE)）。

出力されるデータのライセンスは以下のとおりです。

* 住所データ: [Geolonia 住所データ](https://github.com/geolonia/japanese-addresses-v2), CC BY 4.0

出典: アドレス・ベース・レジストリ, デジタル庁 - 住居表示住所・住居マスターデータセット
