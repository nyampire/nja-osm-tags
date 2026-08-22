/**
 * OSM Japan の「地名のタグ付け方法の例」スプレッドシートの各住所を NJA に流し、
 * 表が期待する quarter / neighbourhood と NJA の machiAza フィールドを突き合わせる。
 */
import { readFileSync } from 'node:fs'
import { normalize } from '@geolonia/normalize-japanese-addresses'

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

console.log(
  ['住所', '期待quarter', '期待neighbourhood', 'NJA.level', 'NJA.oaza_cho', 'NJA.chome', 'NJA.koaza', 'NJA.other'].join('\t'),
)
for (const row of dataRows) {
  const address = row[COL.address] ?? ''
  if (!address) continue
  const r = await normalize(address)
  const m = r.metadata.machiAza
  console.log([
    address,
    row[COL.quarter] || '-',
    row[COL.neighbourhood] || '-',
    String(r.level),
    m?.oaza_cho ?? '-',
    m?.chome ?? '-',
    m?.koaza ?? '-',
    r.other || '-',
  ].join('\t'))
}
