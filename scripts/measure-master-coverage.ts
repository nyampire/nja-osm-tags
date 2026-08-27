/**
 * 町字マスタから、番地解決と数字表記に関わる網羅率を測る。
 *
 *   NJA_API_BASE=.data/japanese-addresses-v2/out/api/ja \
 *     node scripts/measure-master-coverage.ts
 *
 * 主にローカルミラーの `out/api/ja/{都道府県}/{市区町村}.json` を読むだけで決まる。
 * 全国で数秒で終わる。最後の4だけは本ツールを通すので NJA を呼ぶ。
 *
 * 測る量は4つ。
 *
 *   1. 明細（`csv_ranges`）の網羅率。番地を解決できるかを左右する
 *   2. `chome` が常に漢数字かどうか（`formatChome` の前提）
 *   3. 告示の数字表記がどこから復元できるか。`oaza_cho` 自体が算用数字を
 *      持つならそれで足り、漢数字なら `oaza_cho_k`（カナ）を見るしかない
 *   4. 大字が算用数字・丁目が漢数字の混在が出力に出るか
 *
 * 3 は 2026-08 のデータで様子が変わった。札幌市中央区の大字は
 * `北十条西`（漢数字）から `北１０条西`（全角算用）になっている。
 * 4 はその副作用で、`machiAzaTags` が丁目を算用にするかどうかを
 * `oaza_cho_k` で決めているために起きる。
 *
 * 測定値はデータの版に依存する。`meta.updated` を先頭に出すので、
 * 文書に転記するときは併記すること。
 */
import fs from 'node:fs'
import path from 'node:path'
import { cityName, machiAzaName } from '@geolonia/japanese-addresses-v2'
import { findKanjiNumbers } from '@geolonia/japanese-numeral'
// src/index.ts の読み込みで取得先が適用される。applyApiBase() を自分で呼ぶ
// 必要はない（test/apiBase.test.ts がこの経路を規約として固定している）
import { API_BASE_ENV } from '../src/apiBase.ts'
import { addressToOsmTags } from '../src/index.ts'
import { kanaHasArabic } from '../src/numerals.ts'


const base = process.env[API_BASE_ENV]
if (!base || /^https?:\/\//.test(base)) {
  console.error(
    `${API_BASE_ENV} にローカルミラーのパスを指定してください（母集団の走査には実ファイルが必要です）`,
  )
  process.exit(1)
}

/** 明細の網羅率を載せる自治体。住居表示と地番の偏りが対照的なものを選んである */
const RANGE_TARGETS = [
  '東京都千代田区',
  '東京都世田谷区',
  '大阪府大阪市浪速区',
  '北海道帯広市',
  '福島県郡山市',
  '和歌山県東牟婁郡串本町',
  '長野県長野市',
]

/** 数字表記を載せる自治体。条丁目があり大字に数字が入る地域 */
const NUMERAL_TARGETS = ['北海道札幌市中央区', '北海道帯広市', '北海道旭川市']

/** ミラーの町字レコード。`machiaza_id` は全レコードが持つ */
type MachiAza = {
  machiaza_id: string
  oaza_cho?: string
  oaza_cho_k?: string
  koaza?: string
  chome?: string
  rsdt?: true
  csv_ranges?: Record<string, unknown>
}

const jaPath = path.join(base, '..', 'ja.json')
const ja = JSON.parse(fs.readFileSync(jaPath, 'utf8'))

/** 自治体の表示名 → 町字レコードのファイルパス */
const cityPaths = new Map<string, string>()
for (const pref of ja.data) {
  for (const city of pref.cities) {
    const p = path.join(base, pref.pref, `${cityName(city)}.json`)
    if (fs.existsSync(p)) cityPaths.set(`${pref.pref}${cityName(city)}`, p)
  }
}

function load(name: string): MachiAza[] {
  const p = cityPaths.get(name)
  if (p === undefined) {
    throw new Error(
      `${name} がミラーにありません。表記は ja.json の cityName() で決まります`,
    )
  }
  return JSON.parse(fs.readFileSync(p, 'utf8')).data as MachiAza[]
}

const HANKAKU = /[0-9]/
const ZENKAKU = /[０-９]/
const hasKanjiNumber = (s: string) => findKanjiNumbers(s).length > 0

/** 大字1件を数字表記で分類する */
type NumeralKind = 'なし' | '半角算用' | '全角算用' | '漢数字'
function numeralKind(name: string): NumeralKind {
  if (HANKAKU.test(name)) return '半角算用'
  if (ZENKAKU.test(name)) return '全角算用'
  if (hasKanjiNumber(name)) return '漢数字'
  return 'なし'
}

const updated = new Date(ja.meta.updated * 1000).toISOString().slice(0, 10)
console.log(`データ版 ja.json meta.updated = ${updated}`)
console.log(`自治体 ${cityPaths.size}`)

// ---- 1. 明細（csv_ranges）の網羅率 ----
console.log('')
console.log('## 町字明細データの網羅率（自治体別）')
console.log('')
console.log(
  '| 自治体 | 町字数 | `rsdt:true` | うち住居表示CSVあり | 地番CSVあり |',
)
console.log('| --- | --- | --- | --- | --- |')
for (const name of RANGE_TARGETS) {
  const data = load(name)
  const rsdt = data.filter((t) => t.rsdt === true)
  const rsdtCsv = rsdt.filter((t) => t.csv_ranges?.['住居表示'] !== undefined)
  const chibanCsv = data.filter((t) => t.csv_ranges?.['地番'] !== undefined)
  console.log(
    `| ${name} | ${data.length} | ${rsdt.length} | ${rsdtCsv.length} | ${chibanCsv.length} |`,
  )
}

// ---- 全国の走査。2 と 3 の母数もここで数える ----
let total = 0
let rsdtFlag = 0
let rsdtCsv = 0
let rsdtFlagWithCsv = 0
let chibanCsv = 0
/** chome の表記別件数 */
const chomeKind = new Map<NumeralKind, number>()
/** oaza_cho の表記別件数 */
const oazaKind = new Map<NumeralKind, number>()
/** oaza_cho が漢数字のうち、カナが算用数字のもの */
let kanjiOazaKanaArabic = 0
/**
 * 大字が算用数字なのにカナが算用数字でないレコード。
 * `machiAzaTags` は丁目を算用にするかどうかを `oaza_cho_k` で決めるので、
 * この組では大字が算用・丁目が漢数字の混在になる
 */
const mixedCandidates: { input: string; city: string }[] = []
const bump = (m: Map<NumeralKind, number>, k: NumeralKind) =>
  m.set(k, (m.get(k) ?? 0) + 1)

for (const [cityLabel, p] of cityPaths) {
  const data = JSON.parse(fs.readFileSync(p, 'utf8')).data as MachiAza[]
  for (const t of data) {
    total++
    if (t.rsdt === true) rsdtFlag++
    const hasRsdtCsv = t.csv_ranges?.['住居表示'] !== undefined
    if (hasRsdtCsv) rsdtCsv++
    if (t.rsdt === true && hasRsdtCsv) rsdtFlagWithCsv++
    if (t.csv_ranges?.['地番'] !== undefined) chibanCsv++
    if (t.chome !== undefined) bump(chomeKind, numeralKind(t.chome))
    if (t.oaza_cho !== undefined) {
      const kind = numeralKind(t.oaza_cho)
      bump(oazaKind, kind)
      if (kind === '漢数字' && kanaHasArabic(t.oaza_cho_k)) kanjiOazaKanaArabic++
      if (
        (kind === '全角算用' || kind === '半角算用') &&
        t.chome !== undefined &&
        !kanaHasArabic(t.oaza_cho_k)
      ) {
        mixedCandidates.push({
          input: `${cityLabel}${machiAzaName(t)}1-1`,
          city: cityLabel,
        })
      }
    }
  }
}

const pct = (n: number, d: number) =>
  d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`

console.log('')
console.log('## 町字明細データの網羅率（全国）')
console.log('')
console.log('| 項目 | 件数 | 町字数に対する割合 |')
console.log('| --- | --- | --- |')
console.log(`| 町字レコード | ${total} | 100% |`)
console.log(`| \`rsdt:true\` | ${rsdtFlag} | ${pct(rsdtFlag, total)} |`)
console.log(
  `| うち住居表示CSVあり | ${rsdtFlagWithCsv} | ${pct(rsdtFlagWithCsv, rsdtFlag)}（rsdt:true に対する割合） |`,
)
console.log(`| 住居表示CSVあり | ${rsdtCsv} | ${pct(rsdtCsv, total)} |`)
console.log(`| 地番CSVあり | ${chibanCsv} | ${pct(chibanCsv, total)} |`)

// ---- 2. chome の数字表記 ----
const chomeTotal = [...chomeKind.values()].reduce((a, b) => a + b, 0)
console.log('')
console.log(`## \`chome\` の数字表記（全国 ${chomeTotal}件）`)
console.log('')
console.log('| 表記 | 件数 | 割合 |')
console.log('| --- | --- | --- |')
for (const kind of ['漢数字', '全角算用', '半角算用', 'なし'] as NumeralKind[]) {
  const n = chomeKind.get(kind) ?? 0
  console.log(`| ${kind} | ${n} | ${pct(n, chomeTotal)} |`)
}

// ---- 3. 告示の数字表記の在り処 ----
const oazaTotal = [...oazaKind.values()].reduce((a, b) => a + b, 0)
console.log('')
console.log(`## \`oaza_cho\` の数字表記（全国 ${oazaTotal}件）`)
console.log('')
console.log('| 表記 | 件数 | 割合 |')
console.log('| --- | --- | --- |')
for (const kind of ['全角算用', '半角算用', '漢数字', 'なし'] as NumeralKind[]) {
  const n = oazaKind.get(kind) ?? 0
  console.log(`| ${kind} | ${n} | ${pct(n, oazaTotal)} |`)
}
const kanjiOaza = oazaKind.get('漢数字') ?? 0
console.log('')
console.log(
  `\`oaza_cho\` が漢数字 ${kanjiOaza}件 のうち、カナが算用数字 ${kanjiOazaKanaArabic}件（${pct(kanjiOazaKanaArabic, kanjiOaza)}）`,
)

console.log('')
console.log('## 告示の数字表記（自治体別）')
console.log('')
console.log(
  '| 自治体 | 大字 | 全角算用 | 漢数字 | うちカナが算用数字 |',
)
console.log('| --- | --- | --- | --- | --- |')
for (const name of NUMERAL_TARGETS) {
  const data = load(name).filter((t) => t.oaza_cho !== undefined)
  const zen = data.filter((t) => numeralKind(t.oaza_cho!) === '全角算用')
  const kanji = data.filter((t) => numeralKind(t.oaza_cho!) === '漢数字')
  const kanaOk = kanji.filter((t) => kanaHasArabic(t.oaza_cho_k))
  console.log(
    `| ${name} | ${data.length} | ${zen.length} | ${kanji.length} | ${kanaOk.length}（${pct(kanaOk.length, kanji.length)}） |`,
  )
}

// ---- 4. 大字が算用数字・丁目が漢数字の混在 ----
//
// `machiAzaTags` は丁目を算用にするかどうかを `oaza_cho_k` で決める。
// 2026-08 のデータでは `oaza_cho` 自体が算用数字を持つレコードが増えたので、
// カナが算用数字でないと大字だけ算用になり、同じタグ値の中で表記が混ざる。
// 候補を全件本ツールに通して、実際に出力に出るものを数える。
console.log('')
console.log(
  `## 大字が算用数字・丁目が漢数字の混在（候補 ${mixedCandidates.length}件）`,
)
type MixedKind = '混在' | '町字が出ない' | '混在せず'
const mixedByCity = new Map<string, Map<MixedKind, number>>()
const mixedExamples: string[] = []
for (const c of mixedCandidates) {
  const r = await addressToOsmTags(c.input)
  const n = r.tags['addr:neighbourhood'] ?? ''
  const kind: MixedKind =
    /[0-9]/.test(n) && findKanjiNumbers(n).length > 0
      ? '混在'
      : n === ''
        ? '町字が出ない'
        : '混在せず'
  const m = mixedByCity.get(c.city) ?? new Map<MixedKind, number>()
  m.set(kind, (m.get(kind) ?? 0) + 1)
  mixedByCity.set(c.city, m)
  if (kind === '混在' && mixedExamples.length < 4) {
    mixedExamples.push(`\`${c.input}\` → \`${n}\``)
  }
}
console.log('')
console.log('| 自治体 | 混在 | 町字が出ない | 混在せず |')
console.log('| --- | --- | --- | --- |')
let mixedTotal = 0
for (const [city, m] of [...mixedByCity].sort(
  (a, b) => (b[1].get('混在') ?? 0) - (a[1].get('混在') ?? 0),
)) {
  mixedTotal += m.get('混在') ?? 0
  console.log(
    `| ${city} | ${m.get('混在') ?? 0} | ${m.get('町字が出ない') ?? 0} | ${m.get('混在せず') ?? 0} |`,
  )
}
console.log('')
console.log(`混在が出力に出るレコード ${mixedTotal}件`)
for (const e of mixedExamples) console.log(`  ${e}`)
