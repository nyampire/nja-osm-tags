/**
 * MLIT 由来の町字レコードが ABR のレコードと重複している度合いを測る。
 *
 *   NJA_API_BASE=.data/japanese-addresses-v2/out/api/ja \
 *     node scripts/measure-mlit-duplicates.ts [比較する自治体...]
 *
 * `japanese-addresses-v2` は ABR に無い町字を国土数値情報（MLIT）で補い、
 * `machiaza_id` を `MLIT:` で始めて区別している。穴を埋めるための措置だが、
 * ABR 側が整備されると同じ場所のレコードが2本になる。
 *
 * 2本あると入力の表記でどちらに当たるかが変わる。MLIT 側は明細（`csv_ranges`）を
 * 持たないので、本ツールの分類が `chiban` から `machiaza-from-mlit` に移り、
 * 座標の有無まで変わる。
 *
 *   北海道札幌市中央区北十条西十四丁目1-1 → machiaza-from-mlit  座標 level 3
 *   北海道札幌市中央区北10条西14丁目1-1   → chiban              座標なし
 *
 * ## 重複の判定
 *
 * 名前の完全一致だけでは足りない。MLIT 側は数字を漢数字で持ち、ABR 側は
 * 全角算用で持つことがある（`第十三地割字普代` と `第１３地割字普代`）。
 * そこで漢数字ランを算用数字に直し、全角を半角に寄せてから比べる。
 *
 * 名前の偶然一致を重複と数えていないことは、両者の代表点の距離で確かめる。
 * 同じ場所なら距離はほぼ0になる。
 *
 * 引数に自治体名（`都道府県` + `cityName()`）を渡すと、その自治体だけを
 * 公開 API（古いデータ）と突き合わせて重複の増減を出す。ネットワークを使う。
 */
import fs from 'node:fs'
import path from 'node:path'
import { cityName } from '@geolonia/japanese-addresses-v2'
import { findKanjiNumbers, kanji2number } from '@geolonia/japanese-numeral'
import { API_BASE_ENV, applyApiBase } from '../src/apiBase.ts'
import { toHankakuDigits } from '../src/numerals.ts'

applyApiBase()

const base = process.env[API_BASE_ENV]
if (!base || /^https?:\/\//.test(base)) {
  console.error(
    `${API_BASE_ENV} にローカルミラーのパスを指定してください（母集団の走査には実ファイルが必要です）`,
  )
  process.exit(1)
}

/** 公開 API。比較モードでだけ使う */
const PUBLIC_API = 'https://japanese-addresses-v2.geoloniamaps.com/api/ja'

type MachiAza = {
  machiaza_id: string
  oaza_cho?: string
  koaza?: string
  chome?: string
  point?: [number, number]
  csv_ranges?: Record<string, unknown>
}

const isMlit = (t: MachiAza) => t.machiaza_id.startsWith('MLIT:')
const fullName = (t: MachiAza) =>
  `${t.oaza_cho ?? ''}${t.chome ?? ''}${t.koaza ?? ''}`

/**
 * 数字表記の違いを潰して名前を比較可能にする。
 * 漢数字ランを値に直し、全角算用は半角に寄せる。
 *
 * `ke` を渡すと `ケ` と `ヶ` も揃える。上流に出した報告
 * （japanese-addresses-v2-mlit-duplicates.md）がこの範囲で数えているので、
 * 数字だけの場合と両方を出して突き合わせられるようにしてある。
 */
function normalizeName(name: string, ke = false): string {
  let out = toHankakuDigits(name)
  for (const run of findKanjiNumbers(out)) {
    try {
      out = out.replace(run, String(kanji2number(run)))
    } catch {
      // 数値に直せないランは触らない
    }
  }
  return ke ? out.replace(/[ケヶ]/g, 'ケ') : out
}

/** 代表点の距離（概算メートル）。緯度経度は [lng, lat] */
function distanceMeters(
  a: [number, number] | undefined,
  b: [number, number] | undefined,
): number | undefined {
  if (!a || !b) return undefined
  const dx = (a[0] - b[0]) * 91000 * Math.cos((a[1] * Math.PI) / 180)
  const dy = (a[1] - b[1]) * 111000
  return Math.round(Math.hypot(dx, dy))
}

type Census = {
  records: number
  mlit: number
  /** 名前が完全一致する ABR レコードがある */
  exact: number
  /** 数字表記を正規化すると一致する */
  normalized: number
  /** 対応する ABR レコードが無い。穴を埋めている分 */
  orphan: number
  /** 数字に加えて `ケ`/`ヶ` も揃えると一致する分（normalized の内側ではない追加分） */
  keOnly: number
  /** 重複しているレコードの代表点の距離 */
  distances: number[]
  orphanNames: string[]
}

function census(data: MachiAza[]): Census {
  const byExact = new Map<string, MachiAza>()
  const byNormalized = new Map<string, MachiAza>()
  const byKe = new Map<string, MachiAza>()
  for (const t of data) {
    if (isMlit(t)) continue
    byExact.set(fullName(t), t)
    byNormalized.set(normalizeName(fullName(t)), t)
    byKe.set(normalizeName(fullName(t), true), t)
  }

  const out: Census = {
    records: data.length,
    mlit: 0,
    exact: 0,
    normalized: 0,
    orphan: 0,
    keOnly: 0,
    distances: [],
    orphanNames: [],
  }
  for (const t of data) {
    if (!isMlit(t)) continue
    out.mlit++
    const name = fullName(t)
    const hit = byExact.get(name) ?? byNormalized.get(normalizeName(name))
    if (hit === undefined) {
      // 数字だけでは一致しないが `ケ`/`ヶ` も揃えると一致するもの
      const keHit = byKe.get(normalizeName(name, true))
      if (keHit !== undefined) {
        out.keOnly++
        const dk = distanceMeters(t.point, keHit.point)
        if (dk !== undefined) out.distances.push(dk)
      } else {
        out.orphan++
        out.orphanNames.push(name)
      }
      continue
    }
    if (byExact.has(name)) out.exact++
    else out.normalized++
    const d = distanceMeters(t.point, hit.point)
    if (d !== undefined) out.distances.push(d)
  }
  return out
}

const jaPath = path.join(base, '..', 'ja.json')
const ja = JSON.parse(fs.readFileSync(jaPath, 'utf8'))

/** 自治体の表示名 → 町字レコードのファイルパス */
const cityPaths = new Map<string, string>()
/** 自治体の表示名 → 公開 API の URL 用パス */
const cityRemote = new Map<string, string>()
for (const pref of ja.data) {
  for (const city of pref.cities) {
    const name = cityName(city)
    const p = path.join(base, pref.pref, `${name}.json`)
    if (!fs.existsSync(p)) continue
    cityPaths.set(`${pref.pref}${name}`, p)
    cityRemote.set(
      `${pref.pref}${name}`,
      `${encodeURIComponent(pref.pref)}/${encodeURIComponent(name)}.json`,
    )
  }
}

const load = (p: string) =>
  JSON.parse(fs.readFileSync(p, 'utf8')).data as MachiAza[]

const updated = new Date(ja.meta.updated * 1000).toISOString().slice(0, 10)
console.log(`データ版 ja.json meta.updated = ${updated}`)

const compareTargets = process.argv.slice(2)

// ---- 全国の悉皆 ----
const totals: Census = {
  records: 0,
  mlit: 0,
  exact: 0,
  normalized: 0,
  orphan: 0,
  keOnly: 0,
  distances: [],
  orphanNames: [],
}
const orphanByPref = new Map<string, number>()
const dupByPref = new Map<string, number>()

for (const pref of ja.data) {
  for (const city of pref.cities) {
    const key = `${pref.pref}${cityName(city)}`
    const p = cityPaths.get(key)
    if (p === undefined) continue
    const c = census(load(p))
    totals.records += c.records
    totals.mlit += c.mlit
    totals.exact += c.exact
    totals.normalized += c.normalized
    totals.orphan += c.orphan
    totals.keOnly += c.keOnly
    totals.distances.push(...c.distances)
    if (c.orphan > 0) {
      orphanByPref.set(pref.pref, (orphanByPref.get(pref.pref) ?? 0) + c.orphan)
    }
    const dup = c.exact + c.normalized + c.keOnly
    if (dup > 0) dupByPref.set(pref.pref, (dupByPref.get(pref.pref) ?? 0) + dup)
    if (c.orphanNames.length > 0 && totals.orphanNames.length < 12) {
      totals.orphanNames.push(`${key} ${c.orphanNames[0]}`)
    }
  }
}

const pct = (n: number, d: number) =>
  d === 0 ? '—' : `${((n / d) * 100).toFixed(1)}%`
const dup = totals.exact + totals.normalized + totals.keOnly

console.log('')
console.log(`## MLIT 由来レコードの重複（全国 ${totals.mlit}件）`)
console.log('')
console.log('| 区分 | 件数 | 割合 |')
console.log('| --- | --- | --- |')
console.log(
  `| 名前が完全一致する ABR レコードがある | ${totals.exact} | ${pct(totals.exact, totals.mlit)} |`,
)
console.log(
  `| 数字表記を正規化すると一致する | ${totals.normalized} | ${pct(totals.normalized, totals.mlit)} |`,
)
console.log(
  `| さらに \`ケ\`/\`ヶ\` も揃えると一致する | ${totals.keOnly} | ${pct(totals.keOnly, totals.mlit)} |`,
)
console.log(`| **重複の合計** | **${dup}** | **${pct(dup, totals.mlit)}** |`)
console.log(
  `| 対応する ABR レコードが無い（穴を埋めている） | ${totals.orphan} | ${pct(totals.orphan, totals.mlit)} |`,
)

const ds = [...totals.distances].sort((a, b) => a - b)
const q = (f: number) => ds[Math.min(ds.length - 1, Math.floor(ds.length * f))]
console.log('')
console.log(
  `重複 ${dup}件のうち両方に代表点がある ${ds.length}件の距離（概算m）`,
)
console.log(
  `  中央値 ${q(0.5)} / 90%点 ${q(0.9)} / 99%点 ${q(0.99)} / 最大 ${ds[ds.length - 1]}`,
)
console.log(
  `  100m以内 ${ds.filter((x) => x <= 100).length} / 1km超 ${ds.filter((x) => x > 1000).length}`,
)
console.log('名前の偶然一致ではなく同じ場所であることの確認です。')

console.log('')
console.log('| 都道府県 | 重複 | 対応なし |')
console.log('| --- | --- | --- |')
const prefs = [...new Set([...dupByPref.keys(), ...orphanByPref.keys()])].sort(
  (a, b) => (dupByPref.get(b) ?? 0) - (dupByPref.get(a) ?? 0),
)
for (const p of prefs.slice(0, 10)) {
  console.log(`| ${p} | ${dupByPref.get(p) ?? 0} | ${orphanByPref.get(p) ?? 0} |`)
}

console.log('')
console.log('対応する ABR レコードが無いものの例')
for (const n of totals.orphanNames) console.log(`  ${n}`)

// ---- 指定自治体を公開 API と比較 ----
if (compareTargets.length === 0) {
  console.log('')
  console.log(
    '自治体名を引数に渡すと、公開 API（古いデータ）と突き合わせて増減を出します。',
  )
  console.log(
    '  例: node scripts/measure-mlit-duplicates.ts 北海道札幌市中央区 長野県長野市',
  )
} else {
  console.log('')
  console.log('## 公開 API との比較')
  console.log('')
  console.log('| 自治体 | 版 | 全レコード | MLIT | うち重複 | 対応なし |')
  console.log('| --- | --- | --- | --- | --- | --- |')
  for (const key of compareTargets) {
    const p = cityPaths.get(key)
    const remote = cityRemote.get(key)
    if (p === undefined || remote === undefined) {
      console.error(`${key} がミラーにありません`)
      continue
    }
    const res = await fetch(`${PUBLIC_API}/${remote}`)
    if (!res.ok) {
      console.error(`${key} を公開 API から取得できません（${res.status}）`)
      continue
    }
    const old = census(((await res.json()) as { data: MachiAza[] }).data)
    const now = census(load(p))
    console.log(
      `| ${key} | 公開 API | ${old.records} | ${old.mlit} | ${old.exact + old.normalized + old.keOnly} | ${old.orphan} |`,
    )
    console.log(
      `| | ミラー | ${now.records} | ${now.mlit} | ${now.exact + now.normalized + now.keOnly} | ${now.orphan} |`,
    )
  }
}
