/**
 * 入力が指しているのとは別の町字が出た行を、実データから洗い出す。
 *
 *   NJA_API_BASE=.data/japanese-addresses-v2/out/api/ja \
 *     node scripts/measure-town-boundary.ts --address-column 所在地 input.csv ...
 *
 * NJA は `○○町` の `町` を落とした別名を町字パターンとして登録する。
 * パターンは文字数の降順で試されるので、入力が指す町字を照合できたときは
 * そちらが勝つ。照合できなかったときにだけ別名が最後に拾い、
 * 「町字を特定できず」ではなく「誤った町字」になる。
 *
 *   神奈川県横浜市鶴見区鶴見中央   → town=鶴見町  other=中央
 *   福島県郡山市大槻町字天正坦１１ → town=大町    other=槻町字天正坦11
 *   埼玉県本庄市本庄               → town=本町    other=庄
 *
 * 機構と母集団での露出面は docs/town-overmatch.md にある。
 *
 * ## 判定
 *
 * 誤りかどうかは町字マスタに照会して決める。文字列の見た目では決められない。
 * `大字結城` ← `結城西繁昌塚9629番1` は、結城市に `結城西繁昌塚` という町字が
 * 無いので正しい（残余は登録されていない小字）。
 * `大字沼` ← `沼本町` は、小倉南区に `沼本町一丁目`〜`四丁目` があるので誤り。
 *
 * 手順は3つ。
 *
 *   1. `other` は番地解析まで済んだ残余なので、`addr` が空の行だけを対象にする。
 *      そうでない行では「残余は町字の直後から始まる」が成り立たない。
 *   2. 残余を生の入力の末尾に重ねて境界の位置を出す。数字や区切りの正規化は
 *      文字数を変えないので、残余の先頭が漢字なら位置がそのまま出る。
 *      重ならなかった行は別に数えて隠さない。
 *   3. 境界をまたいで実在の町字名の頭と一致するかを見る。一致した町字の大字が
 *      出力された町字の大字と違えば誤り、同じなら「小字まで解決できなかった」
 *      だけなので誤りではない。
 */
import fs from 'node:fs'
import path from 'node:path'
import { machiAzaName } from '@geolonia/japanese-addresses-v2'
import { findKanjiNumbers, kanji2number } from '@geolonia/japanese-numeral'
import { normalize } from '@geolonia/normalize-japanese-addresses'
import { API_BASE_ENV, applyApiBase } from '../src/apiBase.ts'
import { parseCsv } from '../src/csv.ts'
import { toHankakuDigits } from '../src/numerals.ts'

applyApiBase()

const base = process.env[API_BASE_ENV]
if (!base || /^https?:\/\//.test(base)) {
  console.error(
    `${API_BASE_ENV} にローカルミラーのパスを指定してください（マスタ照会に実ファイルが必要です）`,
  )
  process.exit(1)
}

const args = process.argv.slice(2)
let addressColumn = '所在地'
const files: string[] = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--address-column') {
    addressColumn = args[++i]!
  } else {
    files.push(args[i]!)
  }
}
if (files.length === 0) {
  console.error(
    'usage: node scripts/measure-town-boundary.ts [--address-column 所在地] <input.csv>...',
  )
  process.exit(1)
}

/** 残余の先頭がこれなら語の続きが残っている */
const KANJI = /[々〇一-鿿]/
/** 語を構成する文字。境界をまたぐ範囲をここまで伸ばす */
const WORD = /[々〇一-鿿ぁ-んァ-ヶー]/

/**
 * 表記差を畳んで突き合わせに使う。
 *
 * `src/numerals.ts` の `kanjiToArabicByKana` はカナを根拠に置換する出力用の変換で、
 * こちらはカナを持たない入力文字列側も畳む必要があるため別に持つ。
 * 判定にしか使わないので、地名の漢数字を壊しても構わない。
 */
function fold(text: string): string {
  let out = toHankakuDigits(text)
  out = out.replace(/[-－﹣−‐⁃‑‒–—﹘―⎯⏤ーｰ─━]/g, '-')
  out = out.replace(/ヶ/g, 'ケ').replace(/ヵ/g, 'カ')
  for (const run of findKanjiNumbers(out)) {
    try {
      out = out.replace(run, String(kanji2number(run)))
    } catch {
      // 数値に直せないランは触らない
    }
  }
  // `大字` `字` は入力にもマスタにも付いたり付かなかったりする。
  // 郡山市の `大槻町天正坦` に対して入力は `大槻町字天正坦` と書く。
  return out.replace(/大?字/g, '')
}

type MasterEntry = { oaza: string; folded: string }
const masterCache = new Map<string, MasterEntry[]>()

function master(pref: string, city: string): MasterEntry[] {
  const key = `${pref}/${city}`
  const cached = masterCache.get(key)
  if (cached) return cached
  const p = path.join(base!, pref, `${city}.json`)
  let out: MasterEntry[] = []
  if (fs.existsSync(p)) {
    const seen = new Set<string>()
    out = []
    for (const t of JSON.parse(fs.readFileSync(p, 'utf8')).data) {
      const name = machiAzaName(t)
      if (!name || seen.has(name)) continue
      seen.add(name)
      out.push({ oaza: t.oaza_cho ?? '', folded: fold(name) })
    }
  }
  masterCache.set(key, out)
  return out
}

type Row = { input: string; town: string; other: string; matched: string }

let total = 0
let resolved = 0
let kanjiResidue = 0
let addrParsed = 0
let unaligned = 0
let noRunAfter = 0
let noMasterHit = 0
let sameOaza = 0
const wrong: Row[] = []

for (const file of files) {
  const rows = await parseCsv(new URL(file, `file://${process.cwd()}/`))
  const header = rows[0]
  if (!header) throw new Error(`${file} が空です`)
  const addressIndex = header.indexOf(addressColumn)
  if (addressIndex < 0) {
    throw new Error(`${file} に ${addressColumn} 列がありません`)
  }
  for (const row of rows.slice(1)) {
    const input = (row[addressIndex] ?? '').trim()
    if (!input) continue
    total++
    let r
    try {
      r = await normalize(input)
    } catch {
      continue
    }
    const town = r.town ?? ''
    if (!town) continue
    resolved++
    const residue = [...(r.other ?? '')]
    if (residue.length === 0) continue
    if (!KANJI.test(residue[0]!)) continue
    kanjiResidue++

    // 番地が取れていると残余が町字の直後から始まらないので対象外
    if (r.addr) {
      addrParsed++
      continue
    }

    const raw = [...input]
    const at = raw.length - residue.length
    if (at <= 0 || raw[at] !== residue[0]) {
      unaligned++
      continue
    }

    // 境界の前後を語の切れ目まで伸ばした文字列
    let run = 0
    while (run < residue.length && WORD.test(residue[run]!)) run++
    const foldedRun = fold(residue.slice(0, run).join(''))
    if (foldedRun.length === 0) {
      // 残余が `字` だけなど、境界の先に語が残らない場合は判定できない
      noRunAfter++
      continue
    }
    const across = fold(raw.slice(0, at).join('')) + foldedRun
    const minLength = [...foldedRun].length + 1

    // 境界をまたいで実在の町字名の頭と一致するものを、長い順に探す
    let best: MasterEntry | undefined
    let bestLength = 0
    for (const entry of master(r.pref ?? '', r.city ?? '')) {
      for (let k = entry.folded.length; k >= minLength; k--) {
        if (k <= bestLength) break
        if (across.endsWith(entry.folded.slice(0, k))) {
          best = entry
          bestLength = k
          break
        }
      }
    }

    if (!best) {
      noMasterHit++
      continue
    }
    // 比較は畳んだ空間で行う。同じ場所が `島之内` と `大字島之内` の
    // 両方でマスタに入っていることがあり、文字列一致では別物に見える
    if (fold(best.oaza) === fold(r.metadata?.machiAza?.oaza_cho ?? '')) {
      // 大字は合っていて小字まで解決できなかっただけ
      sameOaza++
      continue
    }
    wrong.push({
      input,
      town,
      other: r.other ?? '',
      matched: best.oaza || best.folded,
    })
  }
}

console.log(`入力 ${total}行 / 町字が決まった ${resolved}行`)
console.log(`残余が漢字で始まる ${kanjiResidue}行`)
console.log(`  番地が取れていて対象外 ${addrParsed}行`)
console.log(`  位置合わせ不能 ${unaligned}行`)
console.log(`  境界の先に語が残らず判定不能 ${noRunAfter}行`)
console.log(`  境界をまたぐ町字がマスタに無い（正常）${noMasterHit}行`)
console.log(`  大字は同じで小字が未解決（正常）${sameOaza}行`)
console.log(`  入力とは別の大字が出た ${wrong.length}行`)

const byTown = new Map<string, number>()
for (const r of wrong) byTown.set(r.town, (byTown.get(r.town) ?? 0) + 1)
console.log('\n## 別の大字が出た行 出力町字別')
for (const [t, n] of [...byTown.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${n}\t${t}`)
}

console.log('\n## 別の大字が出た行 全件')
console.log('出力町字\t入力\t残余\tマスタで一致した大字')
for (const r of wrong) {
  console.log(`${r.town}\t${r.input}\t${r.other}\t${r.matched}`)
}
