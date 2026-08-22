/**
 * ライセンス境界テスト用のフィクスチャを生成する。
 * 薬局オープンデータ（sample/05_pharmacy_20260601.csv）から
 * metadata.chiban が返る住所を集める。ネットワークを使う。
 *
 *   npm run fixtures:chiban
 *
 * 地番の値はリポジトリにコミットしないよう '0' にマスクする。
 */
import { writeFileSync } from 'node:fs'
import { normalize } from '@geolonia/normalize-japanese-addresses'
import { parseCsv } from '../src/csv.ts'
import type { FixtureCase } from '../src/types.ts'

const SAMPLE = new URL('../sample/05_pharmacy_20260601.csv', import.meta.url)
const TARGET = 100

const rows = await parseCsv(SAMPLE)
const header = rows[0]
if (!header) throw new Error('CSV が空です')
const addressIndex = header.indexOf('所在地')
if (addressIndex < 0) throw new Error('所在地 列が見つかりません')

const out: FixtureCase[] = []
let scanned = 0
for (const row of rows.slice(1)) {
  if (out.length >= TARGET) break
  const input = row[addressIndex]
  if (!input) continue
  const result = await normalize(input)
  // 数分かかるので進捗を出す。出ないと生きているか分からない
  if (++scanned % 25 === 0) {
    process.stderr.write(`走査 ${scanned} 件 / 地番 ${out.length} 件\n`)
  }
  if (!result.metadata.chiban) continue
  // 地番の値はリポジトリに残さない。分岐を通すのに必要なのは chiban の存在だけ
  result.metadata.chiban = { prc_num1: '0', prc_num2: '0', prc_num3: '0' }
  out.push({ label: `chiban/${out.length}`, input, result })
}

writeFileSync(
  new URL('../test/fixtures/chiban-cases.json', import.meta.url),
  JSON.stringify(out, null, 2) + '\n',
)
console.error(`${out.length} 件を test/fixtures/chiban-cases.json に書き出しました`)
