# API リファレンス

`src/index.ts` が公開する関数と型の一覧です。

## 変換

### `addressToOsmTags(input, options?)`

住所文字列を `addr:*` タグへ変換します。
NJA の住所データ API にアクセスするためネットワークを使います。

```ts
import { addressToOsmTags } from './src/index.ts'

const r = await addressToOsmTags('東京都千代田区紀尾井町1-3')
```

### `toOsmTags(result, options?)`

NJA の `NormalizeResult` を受け取る純粋関数です。
ネットワークにもファイルシステムにも触れません。

NJA の呼び出しを自分で管理したい場合、NJA の設定（`japaneseAddressesApi` や `cacheSize`）を変えたい場合、キャッシュ済みの結果を再変換したい場合はこちらを使います。
ブラウザでも動きます。

```ts
import { normalize } from '@geolonia/normalize-japanese-addresses'
import { toOsmTags } from './src/index.ts'

const r = toOsmTags(await normalize('東京都千代田区紀尾井町1-3'))
```

## 戻り値

### `ConversionResult`

```ts
type ConversionResult = {
  tags: OsmTags
  numberSource: NumberSource
  noNumberReason?: NoNumberReason
  extra: ConversionExtra
}
```

### `OsmTags`

そのまま OSM に投入できるタグです。
値が無いキーは存在しません。

```ts
type OsmTags = {
  'addr:country'?: string        // 'JP' 固定
  'addr:province'?: string       // 都道府県
  'addr:county'?: string         // 郡
  'addr:city'?: string           // 市 / 特別区 / 町 / 村
  'addr:suburb'?: string         // 政令指定都市の区
  'addr:quarter'?: string        // 大字（小字が存在する場合のみ）
  'addr:neighbourhood'?: string  // 町 / 字 / 丁 / 丁目
  'addr:block_number'?: string   // 街区符号
  'addr:housenumber'?: string    // 住居番号（支号があれば `-` 連結）
  note?: string                  // 未処理の残余
  fixme?: string                 // 要確認の明示
}
```

### `NumberSource`

番地の根拠です。
インポート用のデータを作るときは `verified` だけを採ることで、推定分を混ぜずに済みます。

| 値 | 意味 | 実測 |
| --- | --- | --- |
| `verified` | ABR の住居表示明細と照合した番地 | 42.8% |
| `inferred` | 明細データがなく入力文字列から分解した番地。町字が住居表示実施済みなのは確定しているが、番地そのものは未照合 | 15.0% |
| `none` | 番地タグを出していない | 42.2% |

### `NoNumberReason`

番地を出さなかった理由です。
`numberSource` が `none` のときだけ入ります。

| 値 | 意味 |
| --- | --- |
| `chiban` | 地番方式。ライセンス上、変換せず落とした |
| `rsdt-not-implemented` | 住居表示未実施の町字 |
| `rsdt-detail-missing` | 住居表示実施済みだが番地を分解できなかった |
| `machiaza-unresolved` | 町字を特定できなかった |

### `ConversionExtra`

タグにはしない付随情報です。
使い道は呼び出し側に委ねます。

```ts
type ConversionExtra = {
  point?: { lat: number; lng: number; level: number }
  prefectureCode?: number   // 全国地方公共団体コード
  cityCode?: number
  machiazaId?: string       // ABR の町字ID
  kana?: AddressNames
  romaji?: AddressNames
}

type AddressNames = {
  prefecture?: string
  county?: string
  city?: string
  ward?: string
  oazaCho?: string
  koaza?: string
}
```

`point.level` は座標の精度を示します（2 = 市区町村代表点、3 = 町字代表点、8 = 住居表示または地番の位置）。
地番方式の住所では `point` が空になります（ライセンス上の措置）。

## オプション

```ts
type Options = {
  note?: boolean     // note タグを出すか。既定 true
  fixme?: boolean    // fixme タグを出すか。既定 true
  country?: boolean  // addr:country=JP を出すか。既定 true
}
```

## 書き出し

### `toColumns(result, coord?)`

`ConversionResult` を CSV の列に展開します。
出ていないタグは空文字列になり、列が揃います。

```ts
toColumns(result, { lat: 35.679, lng: 139.736 })
```

座標の決め方は `resolveCoord` に集約してあります。

### `resolveCoord(result, coord?)`

出力に使う座標を1箇所で決めます。
`coord` の値が数値として有効で 0 でなければそれを採り、`level` は付けません。
無効なら `extra.point` で補完し、`level` に `point.level` を入れます。
どちらも無ければ `undefined` を返します。

```ts
resolveCoord(result, { lat: 0, lng: 0 })
// → { lat: 35.679107172, lng: 139.736394597, level: 8 }
```

`toColumns` と `toGeoJsonFeature` は両方これを呼びます。
CSV と GeoJSON で補完の挙動が食い違わないようにするためです。

### `toGeoJsonFeature(result, coord?, extraProperties?)`

GeoJSON の Feature を作ります。
座標は `[経度, 緯度]` の順です（RFC 7946）。

`toColumns` と違い、出ていないタグは `properties` に入れません。
`_番地の根拠` は必ず入り、`_備考` と `_座標精度` は値があるときだけ入ります。

`extraProperties` に渡した値は `properties` の土台になります。
バッチ CLI は元データの列をここに渡します。
生成したタグと名前が衝突した場合は生成側が勝ちます。

座標が決まらない場合は `geometry` を `null` にします。
RFC 7946 が認めている形で、行を落とさずに残せます。

```ts
toGeoJsonFeature(result, { lat: 0, lng: 0 }, { ID: '1' })
```

### 列の定義とラベル

| 名前 | 内容 |
| --- | --- |
| `OSM_TAG_COLUMNS` | `addr:*` 9列と `note` `fixme` の計11列 |
| `META_COLUMNS` | `_番地の根拠` `_備考` `_lat` `_lng` `_座標精度` の5列 |
| `numberSourceLabel(s)` | `verified` → `照合済み` など日本語ラベルへ |
| `noNumberReasonLabel(r)` | `chiban` → `地番方式のため対象外` など日本語ラベルへ |

`numberSource` と `noNumberReason` は OSM のタグにしません。
データの作られ方を説明する属性であって OSM に投入するものではないため、`_` 接頭辞を付けた備考列として持たせます。
Excel で開いて絞り込む場面を想定して、値は日本語にしています。

## 型

`MachiAza`、`OsmTags`、`NumberSource`、`NoNumberReason`、`AddressNames`、`ConversionExtra`、`ConversionResult`、`Options`、`GeoJsonFeature`、`ResolvedCoord` を型として再エクスポートしています。

## CSV の読み書き

`src/csv.ts` は公開 API に含めていませんが、バッチ処理を自作する場合は直接 import できます。

| 関数 | 内容 |
| --- | --- |
| `parseCsvText(text)` | RFC4180 準拠。引用符内の改行とカンマに対応し、先頭の BOM を除去 |
| `parseCsv(url)` | ファイルを読んで `parseCsvText` に渡す |
| `formatCsv(rows)` | カンマ・引用符・改行を含む値だけ引用符で囲む |

`parseCsv` はファイル全体を文字列としてメモリに載せます。
44MB・61,399行で実測 513ms、ヒープ 328MB でした。
任意サイズの入力には向きません。
