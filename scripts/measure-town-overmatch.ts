/**
 * 町字パターンが入力より短い範囲で一致してしまう度合いを母集団で測る。
 *
 *   NJA_API_BASE=.data/japanese-addresses-v2/out/api/ja \
 *     node scripts/measure-town-overmatch.ts
 *
 * NJA は町字パターンを作るときに次の2つを行う（`cacheRegexes.ts` の
 * `getTownRegexPatterns`）。
 *
 *   1. `○○町` の `町` を落とした別名を登録する
 *   2. `大字` `字` を任意にする（`.replace(/大?字/g, '(大?字)?')`）
 *
 * どちらも短い町字名では1文字のパターンを生む。`大町` は `大` に、`字浜` は `浜` に
 * 一致する。パターンは文字数の降順で試されるので、入力が指している町字を
 * 照合できなかったときに限って、これらが最後に拾う。結果は「町字を特定できず」
 * ではなく「誤った町字」になる。
 *
 *   岩手県上閉伊郡大槌町大槌１５地割９５ー１５ → town=大町  other=槌15地割95-15
 *
 * 2つが重なると空文字列に一致するパターンまで生まれる。`字町` の別名は `字` で、
 * その正規表現は `(大?字)?` になる。この自治体では入力が何であれ町字が出る。
 *
 * 測る量は2つ。
 *
 *   A 実在しない町字名を与えたときに町字が出る自治体（全1,892自治体を悉皆）
 *   B 1文字だけで町字が決まる（自治体, 文字）の組
 *
 * 可否の判定は NJA 本体に問い合わせる。上流の規則をここに写すと食い違ったときに
 * 測定値が黙って嘘になるため、B の候補生成だけを手元で行い、意図的に上流より
 * 広く作る。取りこぼしていないことは対照サンプルで確かめる。
 */
import fs from 'node:fs'
import path from 'node:path'
import { cityName, machiAzaName } from '@geolonia/japanese-addresses-v2'
import { normalize } from '@geolonia/normalize-japanese-addresses'
import { API_BASE_ENV, applyApiBase } from '../src/apiBase.ts'

applyApiBase()

const base = process.env[API_BASE_ENV]
if (!base || /^https?:\/\//.test(base)) {
  console.error(
    `${API_BASE_ENV} にローカルミラーのパスを指定してください（母集団の走査には実ファイルが必要です）`,
  )
  process.exit(1)
}

/**
 * 町字名に1文字も使われていないひらがな。全749,406レコードの使用文字から選んだ。
 * 町字名にも数字にも一致しないので、これが残れば何文字食われたかが分かる。
 */
const FREE_KANA = 'ゎゔぁぃ'
/** 1文字探査の末尾 */
const PROBE_TAIL = FREE_KANA.slice(0, 2)
/** 実在しない町字名 */
const NONSENSE = FREE_KANA
/** 対照として問い合わせる非候補文字の数（自治体あたり） */
const CONTROL_PER_CITY = 3

/**
 * 1文字パターンになりうる文字を、上流より広く拾う。
 *
 * `大?字` はどこにあっても任意になり、先頭以外の `町` は別名で落ちるので、
 * その両方を外して1文字になる町字名の頭文字を候補にする。
 * 上流の別名登録には自治体内の名前衝突による除外条件があるが、ここでは付けない。
 * 広く拾って NJA に否定させるほうが、条件を写して取りこぼすより安全。
 */
function strip(name: string): string {
  return name.replace(/大?字/g, '').replace(/(?!^町)町/g, '')
}

type City = { pref: string; city: string; names: Set<string> }

const ja = JSON.parse(fs.readFileSync(path.join(base, '..', 'ja.json'), 'utf8'))

const cities: City[] = []
let recordCount = 0
for (const pref of ja.data) {
  for (const city of pref.cities) {
    const cityN = cityName(city)
    const p = path.join(base, pref.pref, `${cityN}.json`)
    if (!fs.existsSync(p)) continue
    const data = JSON.parse(fs.readFileSync(p, 'utf8')).data
    recordCount += data.length
    const names = new Set<string>()
    for (const t of data) names.add(machiAzaName(t))
    cities.push({ pref: pref.pref, city: cityN, names })
  }
}

console.log(`自治体 ${cities.length} / 町字レコード ${recordCount}`)

// ---- A: 実在しない町字名で町字が出る自治体 ----
const fabricating: { city: string; town: string }[] = []
for (const c of cities) {
  const r = await normalize(`${c.pref}${c.city}${NONSENSE}`)
  if (r.town) fabricating.push({ city: `${c.pref}${c.city}`, town: r.town })
}
const fabricatingSet = new Set(fabricating.map((f) => f.city))

console.log('')
console.log(
  `## A 実在しない町字名で町字が出る自治体 ${fabricating.length} / ${cities.length}`,
)
for (const f of fabricating) console.log(`  ${f.city}  →  ${f.town}`)

// ---- B: 1文字で町字が決まる組 ----
type Hit = { pref: string; city: string; char: string; town: string }
const hits: Hit[] = []
let candidateProbes = 0
let controlProbes = 0
const controlHits: string[] = []

for (const c of cities) {
  const candidates = new Set<string>()
  const heads = new Set<string>()
  for (const name of c.names) {
    heads.add([...name][0]!)
    const s = strip(name)
    if ([...s].length === 1) candidates.add(s)
  }

  for (const char of candidates) {
    const r = await normalize(`${c.pref}${c.city}${char}${PROBE_TAIL}`)
    candidateProbes++
    // 残余が末尾そのままなら、食われたのは1文字だけ
    if (!r.town || r.other !== PROBE_TAIL) continue
    // 町字名も1文字なら略記ではなく正しい一致
    if ([...r.town].length === 1) continue
    hits.push({ pref: c.pref, city: c.city, char, town: r.town })
  }

  // 対照: 候補にしなかった頭文字。ここで町字が決まるなら候補生成が漏れている
  const controls = [...heads].filter((x) => !candidates.has(x))
  const stride = Math.max(1, Math.floor(controls.length / CONTROL_PER_CITY))
  for (let i = 0; i < controls.length; i += stride) {
    const char = controls[i]!
    const r = await normalize(`${c.pref}${c.city}${char}${PROBE_TAIL}`)
    controlProbes++
    if (r.town && r.other === PROBE_TAIL && [...r.town].length > 1) {
      controlHits.push(`${c.pref}${c.city}${char} → ${r.town}`)
    }
  }
}

const hitCities = new Set(hits.map((h) => `${h.pref}${h.city}`))
console.log('')
console.log(`## B 1文字で町字が決まる組（町字名は2文字以上）`)
console.log(`  問い合わせ ${candidateProbes}件`)
console.log(`  該当 ${hits.length}組 / ${hitCities.size}自治体`)

const byPref = new Map<string, number>()
for (const h of hits) byPref.set(h.pref, (byPref.get(h.pref) ?? 0) + 1)
console.log('  都道府県別（上位15）')
for (const [k, v] of [...byPref.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)) {
  console.log(`    ${k}  ${v}`)
}

// A で拾った自治体の分は A が説明しているので、候補生成の漏れとは別に数える
const unexplained = controlHits.filter(
  (c) => ![...fabricatingSet].some((f) => c.startsWith(f)),
)
console.log('')
console.log(`## 対照 ${controlProbes}件（候補にしなかった頭文字）`)
console.log(`  1文字で町字が決まったもの ${controlHits.length}件`)
console.log(`  うち A の自治体で説明できないもの ${unexplained.length}件`)
for (const c of unexplained.slice(0, 20)) console.log(`    ${c}`)
if (unexplained.length > 20) {
  console.log(`    ...他 ${unexplained.length - 20}件`)
}
