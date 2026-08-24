# ローカルミラーの構築

大量のデータを処理するとき、Geolonia の住所データ API を叩きすぎるのを避けたい場合の手順です。

リクエスト数の下限は「1 + 自治体数 + 明細を持つ町字の数」で決まります。
自治体は全国約1,900で頭打ちですが、町字は数が多く、住所が地理的に散らばるほど下限が上がります。
20万件規模では数万リクエストになるため、手元にデータを置くほうが現実的です。

NJA の LRU キャッシュを大きくする方法は使えません。
サイズがモジュール読み込み時に評価されるため、`config.cacheSize` を後から変更しても反映されません。

## 取得先の切り替え

環境変数 `NJA_API_BASE` を1つ読みます。

```bash
export NJA_API_BASE=.data/japanese-addresses-v2/out/api/ja
npm run batch -- --address-column 所在地 input.csv > out.csv
```

パスでも URL でも受けます。
`http://` `https://` `file://` で始まれば URL として扱い、それ以外は現在のディレクトリ基準のパスとして解決します。
未設定なら Geolonia の API を使います。

適用した取得先は stderr に1行出ます。
数時間かかるバッチで API を叩いていないことを確認できるようにするためです。

```
住所データの取得先: file:///.../out/api/ja
```

`file://` を指定した場合は起動時に `{base}.json` の存在を確認し、なければ落とします。
20万行を「全行変換失敗」で完走させないためです。

## 構築手順

[geolonia/japanese-addresses-v2](https://github.com/geolonia/japanese-addresses-v2) を clone してビルドします。

```bash
git clone --depth 1 https://github.com/geolonia/japanese-addresses-v2.git .data/japanese-addresses-v2
cd .data/japanese-addresses-v2
npm install
npm run run:all
```

出力は `out/api` に、ダウンロードキャッシュは `cache` に置かれます。
ビルド後は `npm run clear:cache` でキャッシュを捨てられます。

### Node.js v26 で必要な回避

`npm install` がそのままでは通りません（2026-08-24 時点）。

`better-sqlite3` 11.7.2 が Node 26 の V8 ヘッダでコンパイルできないため、12 系に上げます。

```bash
npm install --save-dev better-sqlite3@^12.11.1
```

npm 11 はネイティブビルドを含む install script をブロックするので、承認が必要です。

```bash
npm install-scripts approve esbuild fsevents better-sqlite3
```

### 対象を絞る

全国を回さずに一部の自治体だけ構築できます。
リポジトリ直下の `settings.json` に全国地方公共団体コードの正規表現を書きます。

```json
{
  "lgCodes": ["^131016$", "^052019$", "^304280$"]
}
```

町字と住居表示は都道府県単位のデータなので、指定した自治体を含む都道府県の分だけダウンロードされます。
地番は市区町村単位です。

部分ミラーは正当な使い方です。
含まれない自治体の行は変換に失敗しますが、`bin/batch.ts` が行単位で拾って `_備考` に理由を書いて続行します。

## 地番データは省けません

`04_make_chiban` の出力は全体の大半を占めます。
3自治体（千代田区・秋田市・串本町）での実測では、出力9.5MB のうち9.0MB が地番でした。

本ツールは地番の番地も地番由来の座標も出力しないため、省けるように見えます。
実際に試した結果、省けません。

`-地番.txt` を削除して `10_refresh_csv_ranges` を再実行しても、町字の `csv_ranges.地番` は残ります。
NJA はこれを見て無条件にファイルを開くので `ENOENT` で落ちます。

`csv_ranges.地番` も除去すると落ちなくなりますが、NJA の返す内容が変わります。

| | 地番データあり | 地番データなし |
| --- | --- | --- |
| `level` | 8 | 3 |
| `metadata.chiban` | あり | なし |
| `other` | `''` | `'1800'` |

（`和歌山県東牟婁郡串本町串本1800` の場合）

本ツールの分類は「地番方式のため対象外」から「住居表示未実施の町字」に移り、地番が `note` タグに載ります。
ライセンス上の判定が依拠している `metadata.chiban` という信号そのものを失うため、地番データはミラーに含めてください。

判定の詳細は [known-limitations.md](known-limitations.md) を参照してください。

## 実測値

3自治体（千代田区・秋田市・串本町）での構築。

| ステップ | 時間 | 出力 |
| --- | --- | --- |
| 01 都道府県・市区町村 | 5秒 | 16KB |
| 02 町字 | 6秒 | 500KB |
| 03 住居表示 | 43秒 | 268KB |
| 04 地番 | 25秒 | 9.0MB |
| 10 csv_ranges / 99 stats | 3秒 | — |

全国では出力が10GB規模になります。
ステップ04 は自治体ごとの逐次ダウンロードなので、ここが所要時間の大半を占めます。

## 検証

`test/local-mirror.test.ts` が、ミラーの結果が API の記録と一致することを確認します。
ミラーが無い環境では skip します。

同一プロセスで「API で引いてからミラーに切り替えて引き直す」比較はできません。
NJA が結果をキャッシュするので、2回目はミラーを読まずにキャッシュを返します。
そのためミラー単独で引き、`test/fixtures/` に固定した API の記録と突き合わせています。
