/**
 * NJA が番地をどこまで解決できるかを実データで計測する。
 *
 *   node scripts/measure-coverage.ts [出力先.json] [件数]
 *
 * 既定の出力先は scripts/measured.json（gitignore 対象）、既定の件数は 1000。
 * 入力は sample/05_pharmacy_20260601.csv（厚労省の薬局オープンデータ）で、
 * これは容量が大きいため gitignore してある。
 *
 * ネットワークを使い、1000件で20分前後かかる。
 *
 * サンプリングは seed 固定の線形合同法なので、同じ入力ファイルなら同じ1000件を引く。
 */
import { writeFileSync } from 'node:fs'
import { normalize } from '@geolonia/normalize-japanese-addresses'
import { parseCsv } from '../src/csv.ts'

const outPath = process.argv[2] ?? new URL('./measured.json', import.meta.url).pathname
const targetCount = Number(process.argv[3] ?? 1000)

const rows = await parseCsv(
  new URL('../sample/05_pharmacy_20260601.csv', import.meta.url),
)
const header = rows[0]
if (!header) throw new Error('CSV が空です')
const iAddr = header.indexOf('所在地')
const iLat = header.indexOf('所在地座標（緯度）')
if (iAddr < 0) throw new Error('所在地 列が見つかりません')

const all = rows.slice(1).filter((r) => (r[iAddr] ?? '') !== '')

// 決定的サンプリング（seed 固定の線形合同法）
let seed = 42
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
const sample: string[][] = []
const pool = [...all]
for (let i = 0; i < targetCount && pool.length > 0; i++) {
  sample.push(...pool.splice(Math.floor(rnd() * pool.length), 1))
}

type Stats = {
  total: number
  level: Record<string, number>
  rsdtFlag: number
  rsdtData: number
  chibanData: number
  otherNonEmpty: number
  coord0: number
  error: number
}
const stats: Stats = {
  total: 0,
  level: {},
  rsdtFlag: 0,
  rsdtData: 0,
  chibanData: 0,
  otherNonEmpty: 0,
  coord0: 0,
  error: 0,
}
const results: unknown[] = []
let done = 0

for (const rec of sample) {
  const input = rec[iAddr] ?? ''
  let r
  try {
    r = await normalize(input)
  } catch {
    stats.error++
    continue
  }
  stats.total++
  stats.level[r.level] = (stats.level[r.level] ?? 0) + 1
  if (r.metadata.machiAza?.rsdt === true) stats.rsdtFlag++
  if (r.metadata.rsdt) stats.rsdtData++
  if (r.metadata.chiban) stats.chibanData++
  if (r.other) stats.otherNonEmpty++
  if (iLat >= 0 && Number.parseFloat(rec[iLat] ?? '') === 0) stats.coord0++
  results.push({
    input,
    level: r.level,
    other: r.other,
    rsdtFlag: r.metadata.machiAza?.rsdt === true,
    rsdt: r.metadata.rsdt,
    chiban: r.metadata.chiban,
    machiAza: r.metadata.machiAza,
    city: r.metadata.city,
    pref: r.metadata.prefecture?.pref,
  })
  if (++done % 100 === 0) process.stderr.write(`${done} `)
}

writeFileSync(outPath, JSON.stringify(results))
console.log(`\n${JSON.stringify(stats, null, 2)}`)
console.log(`\n明細を ${outPath} に書き出しました`)
