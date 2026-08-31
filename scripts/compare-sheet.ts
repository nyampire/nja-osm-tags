/**
 * OSM Japan の「地名のタグ付け方法の例」スプレッドシートの各住所を本ツールに流し、
 * 表が期待する quarter / neighbourhood と実際の出力タグを突き合わせる。
 *
 * NJA の `machiAza` フィールドも併記する。食い違ったときに、対応づけの誤りと
 * 上流データの変化のどちらなのかを、同じ1行の中で切り分けられるようにするため。
 *
 * 突き合わせるのは出力タグであって NJA のフィールドではない。
 * docs/osm-tagging-spec.md が主張しているのは本ツールの出力についてなので、
 * NJA のフィールドだけを見て文書を書くと、対応づけを変えたときに検証が空振りする。
 */
import { readFileSync } from 'node:fs'
import { normalize } from '@geolonia/normalize-japanese-addresses'
import { applyApiBase } from '../src/apiBase.ts'
import { toOsmTags } from '../src/index.ts'

// 取得先を NJA_API_BASE に合わせる（未設定なら Geolonia API）
applyApiBase()

/** ごく素朴な CSV パーサ (このファイルは引用符と改行なしフィールドのみ) */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  for (const line of text.trim().split('\n')) {
    const cells: string[] = []
    let cur = ''
    let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (inQuote) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (c === '"') inQuote = false
        else cur += c
      } else if (c === '"') inQuote = true
      else if (c === ',') { cells.push(cur); cur = '' }
      else cur += c
    }
    cells.push(cur)
    rows.push(cells)
  }
  return rows
}

const rows = parseCsv(readFileSync(new URL('./osm-japan-tagging-examples.csv', import.meta.url), 'utf8'))
const dataRows = rows.slice(3) // 1-3 行目はヘッダ

const COL = { address: 0, county: 3, city: 4, town: 5, village: 6, suburb: 7, quarter: 8, neighbourhood: 9 }

/**
 * 一致の種別。
 *
 * `接頭辞` は先頭の「大字」「字」を除けば一致するもの。接頭辞を残すのは
 * 2026-08-21 の決定なので、これは意図した差であって不一致ではない
 * （docs/osm-tagging-spec.md）。両者を同じ「不一致」に混ぜると、
 * 決定済みの差の中に本当の不一致が埋もれる。
 *
 * 剥がすのは先頭だけ。表には `南郷大字中野` のように途中に「大字」を含む
 * 期待値があり、全出現を剥がすと `南郷中野` になって別物と比べてしまう。
 */
function verdict(expected: string, actual: string): string {
  if (expected === actual) return '一致'
  if (expected === actual.replace(/^大?字/, '')) return '接頭辞'
  return '不一致'
}

console.log(
  [
    '住所', '期待quarter', '期待neighbourhood',
    '出力quarter', '出力neighbourhood', '判定',
    'NJA.level', 'NJA.oaza_cho', 'NJA.chome', 'NJA.koaza', 'NJA.other',
  ].join('\t'),
)
for (const row of dataRows) {
  const address = row[COL.address] ?? ''
  if (!address) continue
  const r = await normalize(address)
  const m = r.metadata.machiAza
  const tags = toOsmTags(r).tags
  const expectedQuarter = row[COL.quarter] ?? ''
  const expectedNeighbourhood = row[COL.neighbourhood] ?? ''
  const actualQuarter = tags['addr:quarter'] ?? ''
  const actualNeighbourhood = tags['addr:neighbourhood'] ?? ''
  const v = [
    verdict(expectedQuarter, actualQuarter),
    verdict(expectedNeighbourhood, actualNeighbourhood),
  ]
  console.log([
    address,
    expectedQuarter || '-',
    expectedNeighbourhood || '-',
    actualQuarter || '-',
    actualNeighbourhood || '-',
    v.includes('不一致') ? '不一致' : v.includes('接頭辞') ? '接頭辞' : '一致',
    String(r.level),
    m?.oaza_cho ?? '-',
    m?.chome ?? '-',
    m?.koaza ?? '-',
    r.other || '-',
  ].join('\t'))
}
