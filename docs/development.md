# 開発

このリポジトリを変更する人向けの文書です。
使い方は [README](../README.md) にあります。

## コマンド

Node.js のバージョン要件は README にあります。

| コマンド | 内容 |
| --- | --- |
| `npm test` | vitest |
| `npm run test:watch` | vitest のウォッチモード |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run fixtures` | テスト用フィクスチャの再生成 |
| `npm run fixtures:chiban` | 地番方式フィクスチャの再生成。`sample/` が必要 |

## テスト

区分は3つです。
件数は `npm test` が実行時に表示するので、ここには書きません。

| 区分 | 対象 |
| --- | --- |
| ネットワーク不要 | `test/fixtures/` に固定した NJA の実結果を使う |
| ネットワークが必要 | `index.test.ts` `nja.setup.test.ts` `batch.test.ts` |
| ローカルミラーが必要 | `local-mirror.test.ts`。ミラーが無い環境では skip |

ローカルミラーを使うテストのうち、捏造される町字を母集団で確認するものだけは全国分のミラーが必要です。
残りは3自治体のミラーで足ります。

主要なものを挙げます。

ライセンス境界のテストは `test/license-boundary.test.ts` に独立させています。
地番方式のフィクスチャで番地を出力しないこと、座標を出す場合はその level が8でないことを検証します。
一部のケースは町字代表点（level 3）の座標をそのまま出力するので、level 8 でないことだけを条件にしています。

仕様回帰のテストは OpenStreetMap 公式のタグ付け例を期待値として固定します。

バッチ CLI の行単位エラー処理は `test/batch-error.test.ts` で検証します。
`addressToOsmTags` を差し替えて例外を投げさせるので、ネットワークを使いません。

取得先の切り替えは `test/apiBase.test.ts` で検証します。
`normalize` を直接呼ぶファイルが全て `applyApiBase` を通っているかも併せて検査します。
1箇所でも漏れるとその経路だけ公開 API を叩き続けるため、規約をテストで固定しています。

`vitest.config.ts` で対象を `test/` に限定しています。
既定の設定では `.data/` に構築した `japanese-addresses-v2` のテストまで拾い、そちらが相対パスの `out/` に地番データを書き出してしまうためです。

## フィクスチャ

フィクスチャは NJA v3.1.3 の出力を固定しています。
NJA を上げると期待値が変わる可能性があるので、`npm run fixtures` で再生成してから差分を確認してください。

`scripts/maskChiban.ts` は単体で走らせるものではなく、フィクスチャ生成から呼ばれるヘルパです。
地番の値と地番由来の座標をリポジトリに残さないために使います。

## 調査スクリプト

`scripts/` には実測用のスクリプトを置いています。

| スクリプト | 内容 | 必要なもの |
| --- | --- | --- |
| `measure-coverage.ts` | 薬局データの静的分析と NJA 実行。番地の解決具合を分類する | `sample/` の入力 CSV |
| `summarize-batch-output.ts` | バッチ CLI の出力を集計する。タグの充填率とライセンス境界 | バッチ CLI の出力 |
| `compare-batch-outputs.ts` | バッチ CLI の出力2本を行ごとに突き合わせる。データ版やコード変更の影響を測る | 同じ入力から作った出力2本 |
| `measure-master-coverage.ts` | 町字マスタの明細網羅率と数字表記を母集団で測る。カナが告示の数字表記を保持しているかの検証も含む | ローカルミラー |
| `measure-mlit-duplicates.ts` | 国土数値情報（MLIT）由来のレコードが ABR と重複している度合いを測る | ローカルミラー |
| `measure-town-overmatch.ts` | 町字パターンが入力より短く一致する度合いを母集団で測る | ローカルミラー |
| `measure-town-boundary.ts` | 入力とは別の町字が出た行を実データから洗い出す | ローカルミラー、入力 CSV |
| `compare-sheet.ts` | OpenStreetMap 公式のタグ付け例と本ツールの出力タグを突き合わせる | ネットワークまたはローカルミラー |
| `normalize.ts` `probe-edge-cases.ts` | 1件ずつ NJA の出力を見る調査用 | — |
| `make-fixtures.ts` `make-chiban-fixtures.ts` | テスト用フィクスチャの再生成 | 後者は `sample/` |

`sample/` は容量が大きいため gitignore しており、リポジトリには含まれません。
ローカルミラーの構築は [local-mirror.md](local-mirror.md) にあります。

測定値はデータの版で変わります。
どの版で測ったものかを併記しないと、あとから食い違いを見つけたときに原因を切り分けられません。

## 調査記録

方針が未決のものと、原因を突き止めたが対応していないものです。

| 文書 | 内容 |
| --- | --- |
| [chiwari.md](chiwari.md) | 地割の調査記録。方針は未決定 |
| [town-overmatch.md](town-overmatch.md) | 入力とは別の町字が出る不具合の調査記録 |
| [local-mirror.md](local-mirror.md) | 住所データを手元に構築する手順と、公開 API との結果の違い |

手元にだけ置いている測定記録が2つあります。
どちらも gitignore してあり、特定のデータ版での測定値なのですぐ古くなります。

`docs/nja-coverage.md` は NJA が番地をどこまで解決できるかの実測です。
`japanese-addresses-v2-mlit-duplicates.md` は上流への報告の下書きです。
