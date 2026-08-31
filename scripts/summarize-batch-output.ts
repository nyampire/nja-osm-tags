/**
 * バッチ CLI が出した CSV を集計する。
 *
 *   node scripts/summarize-batch-output.ts out.csv
 *   node scripts/summarize-batch-output.ts out.csv --address-column <列名>
 *
 * `--address-column <列名>` を渡すと、5番目の `note` と入力住所の照合の節が出る。
 *
 * NJA もネットワークも使わない。出力済みの CSV を読むだけ。
 * `_番地の根拠` などの列名は src/serialize.ts から取るので、列を増やしても
 * ここを直さなくてよい。
 *
 * 出す量は5つ。
 *
 *   1. `_番地の根拠` の分布
 *   2. `_備考` の分布
 *   3. タグの充填率
 *   4. ライセンス境界の確認。地番方式の行に番地タグと level 8 の座標が
 *      出ていないこと（test/license-boundary.test.ts が固定している不変条件を、
 *      実データの出力に対しても確かめる）
 *   5. `note` が入力住所から導けるか（`--address-column` を渡したときのみ）
 */
import { parseCsv } from '../src/csv.ts'
import { OSM_TAG_COLUMNS, noNumberReasonLabel } from '../src/serialize.ts'

/**
 * 引数を読む。
 *
 * `--address-column <名前>` は省略できる。省略すると残余の照合の節を出さない。
 * 既存の呼び出し（パスだけを渡す形）はそのまま動く。
 */
function parseArgs(argv: string[]): { file?: string; addressColumn?: string } {
  const out: { file?: string; addressColumn?: string } = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--address-column') {
      i++
      if (argv[i] === undefined) {
        console.error('--address-column には列名を指定してください')
        process.exit(1)
      }
      out.addressColumn = argv[i]
    } else if (a !== undefined && a.startsWith('--')) {
      console.error(`不明なオプションです: ${a}`)
      process.exit(1)
    } else if (a !== undefined && out.file === undefined) {
      out.file = a
    }
  }
  return out
}

const { file, addressColumn } = parseArgs(process.argv.slice(2))
if (!file) {
  console.error(
    '集計する CSV のパスを渡してください（任意で --address-column <列名>）',
  )
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

// 集計を始める前に検査する。全部印字したあとで落ちると読み手が困る
if (addressColumn !== undefined && header.indexOf(addressColumn) < 0) {
  console.error(`${addressColumn} 列がありません`)
  process.exit(1)
}

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
console.log('| タグ | 件数 | 充填率 |')
console.log('| --- | --- | --- |')
for (const name of OSM_TAG_COLUMNS) {
  if (header.indexOf(name) < 0) continue
  const n = data.filter((r) => get(r, name) !== '').length
  console.log(`| \`${name}\` | ${n} | ${pct(n)} |`)
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

// ---- 5. note の中身が入力住所から導けるか ----
//
// note の値は「入力のどこを解釈できなかったか」の指し示しであって、
// 中身そのものは入力住所に含まれている。OSM のタグとして出すかを
// 判断する材料になるので数える。
//
// 比較の前に正規化する。NJA が `１番４０号` を `1-40` に書き直すため、
// 生の文字列比較では 5.9% しか一致しない。
//
// `ー`（U+30FC）はカタカナの長音記号で、住所の区切りに使うのは本来誤りだが
// 元データに実在する（`６４ー９` は 64-9 の意味）。両辺に同じ変換をかけるので、
// `センター` のような正当なカタカナが比較を壊すことはない。
//
// `‐`（U+2010 HYPHEN）は実データでは効いていない。厚労省の病院データでは
// 含めても外しても一致件数は1384件のまま変わらない。他の入力では出現しうる
// ため、防御的に残している。
function normalizeForCompare(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[−―‐ー]/g, '-')
    .replace(/[\s　]/g, '')
}

// note が単なる部分文字列であるだけでなく、パーサーが実際に止まった位置
// （住所の末尾）にあるかを調べる。部分文字列一致だけでは、たとえば `5` の
// ような短い数字の note が住所中のどこかの `5` に偶然一致して割合を
// 水増しする可能性を排除できない。
//
// NJA は住所を解釈するとき末尾の `番地` `号` を取り除くため
// （`５番地` → note `5`）、住所の生の文字列は note そのものでは終わらない。
// そのため note の最後の出現位置を基準に、その後ろに残ってよいのは
// `番地` `番` `号` `の` の繰り返しのみとする。
//
// このうち `号` と `の` は実データの1,384件の末尾一致では一度も出現しない
// （観測される末尾は `""` が977件、`番地` が403件、`番` が4件のみ）。
// それでも他の入力では起こりうるため、防御的に残している。
function isTailMatch(address: string, note: string): boolean {
  const na = normalizeForCompare(address)
  const nn = normalizeForCompare(note)
  const idx = na.lastIndexOf(nn)
  if (idx < 0) return false
  const suffix = na.slice(idx + nn.length)
  return /^(番地|番|号|の)*$/.test(suffix)
}

// 列の存在は、ヘッダ読み込み直後に置いている事前チェック（`addressColumn` が
// 指す列が存在するかを確かめ、なければ `列がありません` と出して落とすガード）で検査済み
if (addressColumn !== undefined) {
  const withNote = data.filter((r) => get(r, 'note') !== '')
  const contained = withNote.filter((r) =>
    normalizeForCompare(get(r, addressColumn)).includes(
      normalizeForCompare(get(r, 'note')),
    ),
  )
  const notContained = withNote.filter(
    (r) =>
      !normalizeForCompare(get(r, addressColumn)).includes(
        normalizeForCompare(get(r, 'note')),
      ),
  )
  const tailMatched = withNote.filter((r) =>
    isTailMatch(get(r, addressColumn), get(r, 'note')),
  )
  const inconsistent = contained.filter(
    (r) => !isTailMatch(get(r, addressColumn), get(r, 'note')),
  )
  const notePct = (n: number) =>
    withNote.length === 0
      ? '—'
      : `${((n / withNote.length) * 100).toFixed(1)}%`
  console.log('')
  console.log(`## \`note\` が入力住所から導けるか（\`note\` あり ${withNote.length}行）`)
  console.log('')
  console.log('| | 件数 | 割合 |')
  console.log('| --- | --- | --- |')
  console.log(
    `| 部分文字列として含まれる | ${contained.length} | ${notePct(contained.length)} |`,
  )
  console.log(
    `| 含まれない | ${notContained.length} | ${notePct(notContained.length)} |`,
  )
  console.log(
    `| 末尾で一致 | ${tailMatched.length} | ${notePct(tailMatched.length)} |`,
  )
  console.log(
    `| 部分文字列だが末尾でない | ${inconsistent.length} | ${notePct(inconsistent.length)} |`,
  )

  // fixme が単独で拾う行があるかを数える。note が入力住所からほぼ導けるのに対し、
  // fixme はどれだけ note と重複しているかを見る
  const withFixme = data.filter((r) => get(r, 'fixme') !== '')
  const fixmeWithNote = withFixme.filter((r) => get(r, 'note') !== '')
  console.log('')
  console.log(
    `\`fixme\` がある行 ${withFixme.length}件のうち、\`note\` も併せ持つ行 ${fixmeWithNote.length}件`,
  )

  // note ありの行の `_備考` 内訳。残余の性格が理由ごとに分かれる
  const byReasonWithNote = new Map<string, number>()
  for (const r of withNote) {
    const v = get(r, '_備考')
    byReasonWithNote.set(v, (byReasonWithNote.get(v) ?? 0) + 1)
  }
  console.log('')
  console.log('| `note` ありの `_備考` | 件数 |')
  console.log('| --- | --- |')
  for (const [v, n] of [...byReasonWithNote].sort((a, b) => b[1] - a[1])) {
    console.log(`| ${v || '（空）'} | ${n} |`)
  }
}
