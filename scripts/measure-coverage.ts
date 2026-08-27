/**
 * NJA が番地をどこまで解決できるかを実データで計測する。
 *
 *   NJA_API_BASE=.data/japanese-addresses-v2/out/api/ja \
 *     node scripts/measure-coverage.ts [出力先.json] [件数]
 *
 * 既定の出力先は scripts/measured.json（gitignore 対象）。
 * 件数は既定で全件。数を渡すとその件数だけ抽出する。
 * 入力は sample/05_pharmacy_20260601.csv（厚労省の薬局オープンデータ）で、
 * これは容量が大きいため gitignore してある。
 *
 * ローカルミラーで全61,398件が25分前後。公開 API では1,000件で20分前後かかるので
 * 全件は現実的でない。**測定値はデータの版に依存する**（`level` の分布や地番方式の
 * 割合が動く）。文書に転記するときはどちらで測ったかを併記すること。
 * ミラーの構築は docs/local-mirror.md にある。
 *
 * サンプリングは seed 固定の線形合同法なので、同じ入力ファイルなら同じ集合を引く。
 *
 * ## 出力
 *
 * 2つの節を markdown の表で出す。
 *
 *   1. 入力文字列の性質。全件の静的分析で、NJA もデータ版も関係しない
 *   2. NJA 実行結果。分類 A〜E と level の分布
 *
 * 分類の定義は下の CLASSES に書いてある。「町字を特定できたか」は
 * `hasMachiAzaName`（src/machiAza.ts）を使う。NJA はプレースホルダの
 * `{machiaza_id:'0000000'}` を返すことがあり、`machiAza` の有無だけを見ると
 * 誤分類するため。規則をここに写さない。
 */
import { writeFileSync } from 'node:fs'
import { normalize } from '@geolonia/normalize-japanese-addresses'
import { findKanjiNumbers } from '@geolonia/japanese-numeral'
import { applyApiBase } from '../src/apiBase.ts'
import { parseCsv } from '../src/csv.ts'
import { hasMachiAzaName } from '../src/machiAza.ts'

// 取得先を NJA_API_BASE に合わせる（未設定なら Geolonia API）
applyApiBase()

const outPath = process.argv[2] ?? new URL('./measured.json', import.meta.url).pathname
const countArg = process.argv[3]

const rows = await parseCsv(
  new URL('../sample/05_pharmacy_20260601.csv', import.meta.url),
)
const header = rows[0]
if (!header) throw new Error('CSV が空です')
const iAddr = header.indexOf('所在地')
const iLat = header.indexOf('所在地座標（緯度）')
if (iAddr < 0) throw new Error('所在地 列が見つかりません')

const all = rows.slice(1).filter((r) => (r[iAddr] ?? '') !== '')
const inputs = all.map((r) => r[iAddr] ?? '')

console.log(`入力 ${all.length}件 / ${header.length}列`)

// ---------------------------------------------------------------------------
// 1. 入力文字列の性質（全件の静的分析）
// ---------------------------------------------------------------------------

/** 判定は正規表現1つで書けるものに限り、定義をそのまま出力に載せる */
const SHAPES: { label: string; re: RegExp }[] = [
  { label: '全角数字を含む', re: /[０-９]/ },
  { label: '半角数字を含む', re: /[0-9]/ },
  { label: '全角ハイフン `－`', re: /－/ },
  { label: '長音符・ダッシュ類 `ー‐–—`', re: /[ー‐–—]/ },
  { label: '`丁目`', re: /丁目/ },
  { label: '`丁目` または `丁`', re: /丁目?/ },
  { label: '`番地`', re: /番地/ },
  { label: '`番`（`番地` 以外）', re: /番(?!地)/ },
  { label: '`号`', re: /号/ },
  { label: '`号室`', re: /号室/ },
  { label: '階（`階` `F` `Ｆ`）', re: /[階FＦ]/ },
  { label: '全角スペース', re: /　/ },
  { label: '漢数字 + `番`/`号`', re: /[一二三四五六七八九十][番号]/ },
  { label: '`の` 区切り（`２番地の８`）', re: /[0-9０-９]の[0-9０-９]/ },
]

console.log('')
console.log(`## 入力文字列の性質（全${all.length}件の静的分析）`)
console.log('')
console.log('| 特徴 | 判定 | 件数 | 割合 |')
console.log('| --- | --- | --- | --- |')
for (const s of SHAPES) {
  const n = inputs.filter((v) => s.re.test(v)).length
  console.log(
    `| ${s.label} | \`${s.re.source}\` | ${n} | ${((n / all.length) * 100).toFixed(1)}% |`,
  )
}

// 丁目の数字表記。`丁` の直前の1文字で分ける
const chomeRows = inputs.filter((v) => /丁目?/.test(v))
let chomeZen = 0
let chomeKanji = 0
let chomeOther = 0
for (const v of chomeRows) {
  const m = /(.)丁目?/.exec(v)
  const c = m?.[1] ?? ''
  if (/[０-９0-9]/.test(c)) chomeZen++
  else if (findKanjiNumbers(c).length > 0) chomeKanji++
  else chomeOther++
}
const pctOf = (n: number, d: number) =>
  d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`
console.log('')
console.log(
  `\`丁目\` または \`丁\` を含む${chomeRows.length}件を、最初の \`丁\` の直前1文字で分けた内訳`,
)
console.log('')
console.log('| 表記 | 件数 | 割合 |')
console.log('| --- | --- | --- |')
console.log(`| 算用数字 | ${chomeZen} | ${pctOf(chomeZen, chomeRows.length)} |`)
console.log(`| 漢数字 | ${chomeKanji} | ${pctOf(chomeKanji, chomeRows.length)} |`)
console.log(
  `| どちらでもない | ${chomeOther} | ${pctOf(chomeOther, chomeRows.length)} |`,
)

// 座標。0.0 のレコードは NJA の代表点で補完できる
if (iLat >= 0) {
  const zero = all.filter((r) => Number.parseFloat(r[iLat] ?? '') === 0).length
  console.log('')
  console.log(
    `入力データの緯度が \`0\` のレコード ${zero}件（${pctOf(zero, all.length)}）`,
  )
}

// ---------------------------------------------------------------------------
// 2. NJA 実行結果
// ---------------------------------------------------------------------------

// 決定的サンプリング（seed 固定の線形合同法）。件数を渡さなければ全件
const targetCount =
  countArg === undefined ? all.length : Math.min(Number(countArg), all.length)
let seed = 42
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
const sample: string[][] = []
const pool = [...all]
for (let i = 0; i < targetCount && pool.length > 0; i++) {
  sample.push(...pool.splice(Math.floor(rnd() * pool.length), 1))
}

/**
 * 分類。上から順に当てはめる。順序が定義そのもの。
 *
 * E を先に見るのは、町字が取れていない行に番地の分類を当てても意味がないため。
 * A（明細あり）を C（地番）より先に見るのは、両方が付く行では住居表示の明細で
 * 番地が確定するため。本ツールの `decideNumbers` はライセンス境界を守るために
 * 逆の順序（chiban を先）を採っており、**そちらとは別の目的の分類**である。
 */
const CLASSES = [
  { key: 'E', label: '町字すら特定できず' },
  { key: 'A', label: '住居表示明細あり（番地確定）' },
  { key: 'C', label: '地番方式（ライセンス上の対象外）' },
  { key: 'B', label: '住居表示実施済みだが明細なし' },
  { key: 'D', label: '町字は特定できたが番地体系不明' },
] as const
type ClassKey = (typeof CLASSES)[number]['key']

function classify(r: {
  metadata: {
    machiAza?: unknown
    rsdt?: unknown
    chiban?: unknown
  }
}): ClassKey {
  const machiAza = r.metadata.machiAza as Parameters<typeof hasMachiAzaName>[0]
  if (!hasMachiAzaName(machiAza)) return 'E'
  if (r.metadata.rsdt) return 'A'
  if (r.metadata.chiban) return 'C'
  if ((machiAza as { rsdt?: boolean }).rsdt === true) return 'B'
  return 'D'
}

const classCount = new Map<ClassKey, number>()
const levelCount = new Map<number, number>()
/** 分類ごとの other の様子 */
const otherNonEmpty = new Map<ClassKey, number>()
const otherStartsDigit = new Map<ClassKey, number>()
const examples = new Map<ClassKey, string[]>()
let rsdtAndChiban = 0
let rsdtNum2 = 0
let errors = 0
const results: unknown[] = []
let done = 0
const bump = <K>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1)

for (const rec of sample) {
  const input = rec[iAddr] ?? ''
  let r
  try {
    r = await normalize(input)
  } catch {
    errors++
    continue
  }
  const cls = classify(r)
  bump(classCount, cls)
  bump(levelCount, r.level)
  if (r.metadata.rsdt && r.metadata.chiban) rsdtAndChiban++
  // rsdt_num2 は支号が無い行でも空文字列で入る。`decideNumbers` と同じく
  // 真値だけを数える（`[rsdt_num, rsdt_num2].filter(Boolean)`）
  if (r.metadata.rsdt?.rsdt_num2) rsdtNum2++
  if (r.other) {
    bump(otherNonEmpty, cls)
    if (/^[0-9０-９]/.test(r.other)) bump(otherStartsDigit, cls)
    const ex = examples.get(cls) ?? []
    if (ex.length < 4) {
      ex.push(`\`${input}\` → \`${r.other}\``)
      examples.set(cls, ex)
    }
  }
  results.push({
    input,
    class: cls,
    level: r.level,
    other: r.other,
    rsdtFlag: r.metadata.machiAza?.rsdt === true,
    rsdt: r.metadata.rsdt,
    chiban: r.metadata.chiban,
    machiAza: r.metadata.machiAza,
    city: r.metadata.city,
    pref: r.metadata.prefecture?.pref,
  })
  if (++done % 1000 === 0) process.stderr.write(`${done} `)
}

const measured = done
console.log('')
console.log(`## NJA 実行結果（${measured}件）`)
console.log('')
console.log('| 分類 | 件数 | 割合 |')
console.log('| --- | --- | --- |')
for (const c of CLASSES) {
  const n = classCount.get(c.key) ?? 0
  console.log(`| ${c.key} ${c.label} | ${n} | ${pctOf(n, measured)} |`)
}
console.log('')
console.log(`変換に失敗した行 ${errors}件`)
console.log(`\`rsdt\` と \`chiban\` の両方が付いた行 ${rsdtAndChiban}件`)
console.log(`支号（\`rsdt_num2\`）を持つ行 ${rsdtNum2}件`)

console.log('')
console.log('| `level` | 件数 | 割合 |')
console.log('| --- | --- | --- |')
for (const lv of [...levelCount.keys()].sort((a, b) => a - b)) {
  const n = levelCount.get(lv) ?? 0
  console.log(`| ${lv} | ${n} | ${pctOf(n, measured)} |`)
}

console.log('')
console.log('| 分類 | `other` が空でない | うち数字で始まる |')
console.log('| --- | --- | --- |')
for (const c of CLASSES) {
  const total = classCount.get(c.key) ?? 0
  const ne = otherNonEmpty.get(c.key) ?? 0
  const sd = otherStartsDigit.get(c.key) ?? 0
  console.log(
    `| ${c.key} | ${ne}（${pctOf(ne, total)}） | ${sd}（${pctOf(sd, ne)}） |`,
  )
}

for (const c of CLASSES) {
  const ex = examples.get(c.key)
  if (!ex || ex.length === 0) continue
  console.log('')
  console.log(`分類 ${c.key} の \`other\` の例`)
  for (const e of ex) console.log(`  ${e}`)
}

writeFileSync(outPath, JSON.stringify(results))
console.log('')
console.log(`明細を ${outPath} に書き出しました`)
