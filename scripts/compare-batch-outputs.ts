/**
 * バッチ CLI の出力2本を行ごとに突き合わせる。
 *
 *   node scripts/compare-batch-outputs.ts 旧.csv 新.csv
 *
 * NJA もネットワークも使わない。出力済みの CSV を2本読むだけ。
 *
 * 使い道は2つ。
 *
 *   1. データの版を変えたときに何行変わるか（公開 API とローカルミラー）
 *   2. コードを変えたときに何行変わるか（同じデータで再生成した出力）
 *
 * どちらも「変わった行数」だけでは足りない。何が何に変わったかを出す。
 * 2本は同じ入力を同じ順序で処理した出力であることが前提で、行数が違えば落とす。
 */
import { parseCsv } from '../src/csv.ts'

const [oldPath, newPath] = process.argv.slice(2)
if (!oldPath || !newPath) {
  console.error('比較する CSV を2つ渡してください（旧, 新）')
  process.exit(1)
}

const load = async (f: string) => {
  const rows = await parseCsv(new URL(f, `file://${process.cwd()}/`))
  const header = rows[0]
  if (!header) throw new Error(`${f} が空です`)
  return { header, data: rows.slice(1).filter((r) => r.length > 1) }
}

const a = await load(oldPath)
const b = await load(newPath)

if (JSON.stringify(a.header) !== JSON.stringify(b.header)) {
  console.error('ヘッダが一致しません。同じ列構成の出力を渡してください')
  process.exit(1)
}
if (a.data.length !== b.data.length) {
  console.error(
    `行数が違います（${a.data.length} と ${b.data.length}）。同じ入力を同じ順序で処理した出力を渡してください`,
  )
  process.exit(1)
}

const header = a.header
const tagCols = header.filter(
  (c) => c.startsWith('addr:') || c === 'note' || c === 'fixme',
)
const idx = (c: string) => header.indexOf(c)
const g = (r: string[], c: string) => (idx(c) < 0 ? '' : (r[idx(c)] ?? ''))
/** 入力住所の列。バッチ CLI は元の列をそのまま残すので名前が固定できない */
const addrCol = header.find((c) => c === '所在地' || c === '住所') ?? header[0]!

let changed = 0
let reasonChanged = 0
let tagChanged = 0
let sourceChanged = 0
const reasonPairs = new Map<string, number>()
const sourcePairs = new Map<string, number>()
const examples: string[] = []

for (let i = 0; i < a.data.length; i++) {
  const ra = a.data[i]!
  const rb = b.data[i]!
  const tagsA = tagCols.map((c) => g(ra, c)).join('|')
  const tagsB = tagCols.map((c) => g(rb, c)).join('|')
  const reasonA = g(ra, '_備考')
  const reasonB = g(rb, '_備考')
  const srcA = g(ra, '_番地の根拠')
  const srcB = g(rb, '_番地の根拠')

  if (tagsA !== tagsB || reasonA !== reasonB || srcA !== srcB) changed++
  if (reasonA !== reasonB) {
    reasonChanged++
    const k = `${reasonA || '（空）'} → ${reasonB || '（空）'}`
    reasonPairs.set(k, (reasonPairs.get(k) ?? 0) + 1)
  }
  if (srcA !== srcB) {
    sourceChanged++
    const k = `${srcA} → ${srcB}`
    sourcePairs.set(k, (sourcePairs.get(k) ?? 0) + 1)
  }
  if (tagsA !== tagsB) {
    tagChanged++
    if (examples.length < 8) {
      examples.push(
        `${g(ra, addrCol)}\n    旧 ${tagsA.replace(/\|+$/, '')}\n    新 ${tagsB.replace(/\|+$/, '')}`,
      )
    }
  }
}

const total = a.data.length
const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`

console.log(`旧 ${oldPath}`)
console.log(`新 ${newPath}`)
console.log(`${total}行`)
console.log('')
console.log(`何かが変わった行 ${changed}件（${pct(changed)}）`)
console.log(`  \`_備考\` が変わった ${reasonChanged}件`)
console.log(`  \`_番地の根拠\` が変わった ${sourceChanged}件`)
console.log(`  タグが変わった ${tagChanged}件`)

if (reasonPairs.size > 0) {
  console.log('')
  console.log('| `_備考` の遷移 | 件数 |')
  console.log('| --- | --- |')
  for (const [k, v] of [...reasonPairs].sort((x, y) => y[1] - x[1])) {
    console.log(`| ${k} | ${v} |`)
  }
}

if (sourcePairs.size > 0) {
  console.log('')
  console.log('| `_番地の根拠` の遷移 | 件数 |')
  console.log('| --- | --- |')
  for (const [k, v] of [...sourcePairs].sort((x, y) => y[1] - x[1])) {
    console.log(`| ${k} | ${v} |`)
  }
}

if (examples.length > 0) {
  console.log('')
  console.log('タグが変わった行の例')
  for (const e of examples) console.log(`  ${e}`)
}
