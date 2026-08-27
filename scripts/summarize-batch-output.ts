/**
 * バッチ CLI が出した CSV を集計する。
 *
 *   node scripts/summarize-batch-output.ts out.csv
 *
 * NJA もネットワークも使わない。出力済みの CSV を読むだけ。
 * `_番地の根拠` などの列名は src/serialize.ts から取るので、列を増やしても
 * ここを直さなくてよい。
 *
 * 出す量は4つ。
 *
 *   1. `_番地の根拠` の分布
 *   2. `_備考` の分布
 *   3. タグの充填率
 *   4. ライセンス境界の確認。地番方式の行に番地タグと level 8 の座標が
 *      出ていないこと（test/license-boundary.test.ts が固定している不変条件を、
 *      実データの出力に対しても確かめる）
 */
import { parseCsv } from '../src/csv.ts'
import { OSM_TAG_COLUMNS, noNumberReasonLabel } from '../src/serialize.ts'

const file = process.argv[2]
if (!file) {
  console.error('集計する CSV のパスを渡してください')
  process.exit(1)
}

const rows = await parseCsv(new URL(file, `file://${process.cwd()}/`))
const header = rows[0]
if (!header) throw new Error('CSV が空です')
const data = rows.slice(1).filter((r) => r.length > 1)
const col = (name: string) => {
  const i = header.indexOf(name)
  if (i < 0) throw new Error(`${name} 列がありません`)
  return i
}
const get = (r: string[], name: string) => r[col(name)] ?? ''

const total = data.length
const pct = (n: number) => (total === 0 ? '—' : `${((n / total) * 100).toFixed(1)}%`)

console.log(`${file}  ${total}行`)

// ---- 1. _番地の根拠 ----
const bySource = new Map<string, number>()
for (const r of data) {
  const v = get(r, '_番地の根拠')
  bySource.set(v, (bySource.get(v) ?? 0) + 1)
}
console.log('')
console.log('| `_番地の根拠` | 件数 | 割合 |')
console.log('| --- | --- | --- |')
for (const [v, n] of [...bySource].sort((a, b) => b[1] - a[1])) {
  console.log(`| ${v || '（空）'} | ${n} | ${pct(n)} |`)
}

// ---- 2. _備考 ----
const byReason = new Map<string, number>()
for (const r of data) {
  const v = get(r, '_備考')
  byReason.set(v, (byReason.get(v) ?? 0) + 1)
}
console.log('')
console.log('| `_備考` | 件数 | 割合 |')
console.log('| --- | --- | --- |')
for (const [v, n] of [...byReason].sort((a, b) => b[1] - a[1])) {
  console.log(`| ${v || '（空）'} | ${n} | ${pct(n)} |`)
}

// ---- 3. タグの充填率 ----
console.log('')
console.log('| タグ | 充填率 |')
console.log('| --- | --- |')
for (const name of OSM_TAG_COLUMNS) {
  if (header.indexOf(name) < 0) continue
  const n = data.filter((r) => get(r, name) !== '').length
  console.log(`| \`${name}\` | ${pct(n)} |`)
}

// ---- 4. ライセンス境界の確認 ----
const chibanLabel = noNumberReasonLabel('chiban')
const chiban = data.filter((r) => get(r, '_備考') === chibanLabel)
const chibanWithNumber = chiban.filter(
  (r) =>
    get(r, 'addr:block_number') !== '' || get(r, 'addr:housenumber') !== '',
)
const chibanWithLevel8 = chiban.filter((r) => get(r, '_座標精度') === '8')
console.log('')
console.log(`## ライセンス境界（\`${chibanLabel}\` ${chiban.length}行）`)
console.log('')
console.log(`番地タグが出た行 ${chibanWithNumber.length}件`)
console.log(`\`_座標精度\` が 8 の行 ${chibanWithLevel8.length}件`)

// 参考: note が数字で始まる行。住居表示未実施の区域では実質的に地番が残る。
// 全行での割合（docs/local-mirror.md がデータ版の比較に使う値）と、
// 住居表示未実施に限った割合（docs/nja-coverage.md の値）の両方を出す
const noteDigitAll = data.filter((r) => /^[0-9０-９]/.test(get(r, 'note')))
console.log('')
console.log(
  `\`note\` が数字で始まる行 ${noteDigitAll.length}件（${pct(noteDigitAll.length)}）`,
)
const noteDigitByReason = new Map<string, number>()
for (const r of noteDigitAll) {
  const v = get(r, '_備考') || '（空）'
  noteDigitByReason.set(v, (noteDigitByReason.get(v) ?? 0) + 1)
}
console.log(
  `  その \`_備考\` 内訳: ${[...noteDigitByReason]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v}`)
    .join(', ')}`,
)

const notImplemented = data.filter(
  (r) => get(r, '_備考') === noNumberReasonLabel('rsdt-not-implemented'),
)
const noteDigit = notImplemented.filter((r) => /^[0-9０-９]/.test(get(r, 'note')))
console.log('')
console.log(
  `\`${noNumberReasonLabel('rsdt-not-implemented')}\` ${notImplemented.length}行のうち \`note\` が数字で始まる行 ${noteDigit.length}件（${
    notImplemented.length === 0
      ? '—'
      : `${((noteDigit.length / notImplemented.length) * 100).toFixed(0)}%`
  }、全体の ${pct(noteDigit.length)}）`,
)

// 参考: 地割が place タグに入った行
const chiwari = data.filter(
  (r) =>
    /地割/.test(get(r, 'addr:neighbourhood')) ||
    /地割/.test(get(r, 'addr:quarter')),
)
console.log(`\`地割\` が place タグに入った行 ${chiwari.length}件（${pct(chiwari.length)}）`)

// 参考: 座標が代表点で補完された行
if (header.indexOf('_座標精度') >= 0) {
  const byLevel = new Map<string, number>()
  for (const r of data) {
    const v = get(r, '_座標精度')
    if (v === '') continue
    byLevel.set(v, (byLevel.get(v) ?? 0) + 1)
  }
  const filled = [...byLevel.values()].reduce((a, b) => a + b, 0)
  console.log('')
  console.log(`代表点で補完した行 ${filled}件（${pct(filled)}）`)
  console.log('')
  console.log('| `_座標精度` | 件数 |')
  console.log('| --- | --- |')
  for (const lv of [...byLevel.keys()].sort()) {
    console.log(`| ${lv} | ${byLevel.get(lv)} |`)
  }
  const noCoord = data.filter((r) => get(r, '_lat') === '').length
  console.log('')
  console.log(`座標が決まらなかった行 ${noCoord}件（${pct(noCoord)}）`)
}
