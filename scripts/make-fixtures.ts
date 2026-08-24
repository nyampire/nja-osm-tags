/**
 * テスト用フィクスチャを生成する。ネットワークを使う。
 *
 *   npm run fixtures
 *
 * NJA を更新したら再生成する。
 */
import { writeFileSync } from 'node:fs'
import { normalize } from '@geolonia/normalize-japanese-addresses'
import { parseCsv } from '../src/csv.ts'
import type { FixtureCase } from '../src/types.ts'
import { applyApiBase } from '../src/apiBase.ts'
import { maskChiban } from './maskChiban.ts'

// 取得先を NJA_API_BASE に合わせる。部分ミラーで生成すると期待値が
// 変わるので、適用された取得先は stderr に出る
applyApiBase()

const CASES: [label: string, input: string][] = [
  ['verified/丁目なし', '東京都千代田区紀尾井町1-3'],
  ['verified/残余あり', '東京都千代田区紀尾井町1-3 東京ガーデンテラス紀尾井町 5F'],
  ['verified/政令市の区+丁目', '大阪府大阪市浪速区日本橋西一丁目1-3'],
  ['verified/算用数字告示', '北海道帯広市西19条南42丁目1-1'],
  ['inferred/2要素+残余', '秋田県秋田市山王五丁目１０－２８　はりまビル'],
  ['inferred/3要素', '大阪府大阪市城東区野江４－１－８－１０２'],
  ['inferred/2要素', '東京都千代田区丸の内二丁目7-2'],
  ['inferred/1要素', '青森県八戸市田向５丁目２９'],
  ['chiban/郡あり', '和歌山県東牟婁郡串本町串本1800'],
  ['chiban/政令市の区+残余', '大阪府堺市北区東浅香山町３－１２　千創ビル１階'],
  ['chiban/通り名', '京都府京都市中京区河原町通二条下る一之船入町384'],
  ['chiban/丁目漢数字告示', '千葉県流山市江戸川台西4丁目1-1'],
  ['koaza/大字と字の接頭辞', '青森県南津軽郡藤崎町藤崎西村井'],
  ['koaza/接頭辞なし大字', '福島県郡山市安積町柴宮東'],
  ['koaza/大字を途中に含む', '青森県八戸市南郷大字中野舘野'],
  ['machiaza-unresolved', '神奈川県横浜市旭区二俣川'],
  ['chome/丁', '大阪府堺市堺区市之町西1丁'],
  ['chome/大字なし', '静岡県下田市二丁目'],
  ['rsdt-not-implemented/無番地', '長野県北安曇郡小谷村千国乙無番地'],
  ['rsdt-detail-missing/数字で始まらない', '大阪府高槻市別所新町別所新町２－１４－２０１'],
]

const out: FixtureCase[] = []
for (const [label, input] of CASES) {
  const result = await normalize(input)
  maskChiban(result)
  out.push({ label, input, result })
  console.error(`${label}: level=${result.level}`)
}
writeFileSync(
  new URL('../test/fixtures/cases.json', import.meta.url),
  JSON.stringify(out, null, 2) + '\n',
)
console.error(`\n${out.length} 件を test/fixtures/cases.json に書き出しました`)

// --- スプレッドシート40件 ---
const sheetRows = (
  await parseCsv(new URL('./osm-japan-tagging-examples.csv', import.meta.url))
).slice(3) // 1-3行目はヘッダ

const sheetOut: FixtureCase[] = []
for (const row of sheetRows) {
  const address = row[0]
  if (!address) continue
  const result = await normalize(address)
  maskChiban(result)
  sheetOut.push({ label: address, input: address, result })
}
writeFileSync(
  new URL('../test/fixtures/sheet-cases.json', import.meta.url),
  JSON.stringify(sheetOut, null, 2) + '\n',
)
console.error(`${sheetOut.length} 件を test/fixtures/sheet-cases.json に書き出しました`)
