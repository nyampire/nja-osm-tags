/**
 * 町字マスタの地割レコードを母集団で数える。
 *
 *   NJA_API_BASE=.data/japanese-addresses-v2/out/api/ja \
 *     node scripts/measure-chiwari-master.ts
 *
 * `out/api/ja/{都道府県}/{市区町村}.json` を読むだけで決まる。
 * ネットワークも NJA も使わない。全国で数秒で終わる。
 *
 * docs/chiwari.md の母集団の節（内訳・表記の揺れ・place タグが空になる
 * ケースの有無）を出す。文書に数字を書く前にこれを走らせること。
 *
 * 走査は ja.json の索引が挙げる自治体ファイルに限る。`out/api/ja` 配下を
 * 再帰的に走ると `{都道府県}.json` 47個も拾い、その `data` は町字ではなく
 * 市区町村の索引なので、母数が lgCount（1,898）だけ膨らむ。
 * 実際に chiwari.md はこれで母数を 751,304 と書いていた（正しくは 749,406）。
 *
 * 測定値はデータの版に依存する。`meta.updated` を先頭に出すので、
 * 文書に転記するときは併記すること。
 */
import fs from 'node:fs'
import path from 'node:path'
import { cityName } from '@geolonia/japanese-addresses-v2'
import { API_BASE_ENV } from '../src/apiBase.ts'
import type { MachiAza } from '../src/types.ts'

/**
 * 数字部分。全角算用・半角算用・漢数字を受ける。
 * 母集団には全角算用と漢数字しか無いが、入力側には半角もありうる。
 */
const NUM = '[0-9０-９一二三四五六七八九十百]+'
/**
 * 地割。`第` は任意（母集団の3分の1が `第` なし）。
 * `地割` の部分文字列で探すと `飛地割` `覚地割` のような通常の字名を
 * 誤爆するので、数字を必須にしている。誤爆する分も数えて対照にする。
 */
const CHIWARI = new RegExp(`第?${NUM}地割`)
/** 名前がまるごと地割であるもの。剥がすと何も残らない形の検出に使う */
const CHIWARI_ONLY = new RegExp(`^第?${NUM}地割$`)
/** 地割が先頭に来る形。末尾に来る形（宮古市）と区別する */
const CHIWARI_HEAD = new RegExp(`^第?${NUM}地割`)

const base = process.env[API_BASE_ENV]
if (!base || /^https?:\/\//.test(base)) {
  console.error(
    `${API_BASE_ENV} にローカルミラーのパスを指定してください（母集団の走査には実ファイルが必要です）`,
  )
  process.exit(1)
}

const ja = JSON.parse(
  fs.readFileSync(path.join(base, '..', 'ja.json'), 'utf8'),
) as {
  meta: { updated: number }
  data: { pref: string; cities: Parameters<typeof cityName>[0][] }[]
}

console.log(
  `データ版 ja.json meta.updated = ${new Date(ja.meta.updated * 1000).toISOString().slice(0, 10)}`,
)

type Row = { pref: string; city: string; t: MachiAza }

let cities = 0
let records = 0
const chiwari: Row[] = []
/** 数字が付かない「地割」。部分文字列で判定した場合に誤爆する分 */
const lookalike: Row[] = []

for (const pref of ja.data) {
  for (const city of pref.cities) {
    const name = cityName(city)
    const p = path.join(base, pref.pref, `${name}.json`)
    // ja.json は1,898自治体を持つが、実ファイルがあるのは1,892。
    // 欠けている6件は北方領土（test/local-mirror.test.ts に同じ注記がある）
    if (!fs.existsSync(p)) continue
    cities++
    for (const t of JSON.parse(fs.readFileSync(p, 'utf8')).data as MachiAza[]) {
      records++
      const full = `${t.oaza_cho ?? ''}${t.chome ?? ''}${t.koaza ?? ''}`
      if (CHIWARI.test(full)) chiwari.push({ pref: pref.pref, city: name, t })
      else if (full.includes('地割'))
        lookalike.push({ pref: pref.pref, city: name, t })
    }
  }
}

const pct = (n: number) => `${((n / records) * 100).toFixed(3)}%`

console.log(`\n## 母数`)
console.log(`自治体 ${cities.toLocaleString()} / 町字レコード ${records.toLocaleString()}`)
console.log(`地割 ${chiwari.length.toLocaleString()}（${pct(chiwari.length)}）`)
console.log(`数字が付かない「地割」（部分文字列で判定した場合の誤爆） ${lookalike.length}`)

console.log(`\n## 形の内訳`)
const forms = new Map<string, number>([
  ['koaza=第N地割（大字あり）', 0],
  ['koaza=第N地割字XX', 0],
  ['oaza_cho=第N地割…（先頭）', 0],
  ['oaza_cho=…第N地割（末尾）', 0],
  ['その他', 0],
])
const bump = (k: string) => forms.set(k, forms.get(k)! + 1)
for (const { t } of chiwari) {
  const koaza = t.koaza ?? ''
  const oaza = t.oaza_cho ?? ''
  if (CHIWARI.test(koaza))
    bump(CHIWARI_ONLY.test(koaza) ? 'koaza=第N地割（大字あり）' : 'koaza=第N地割字XX')
  else if (CHIWARI.test(oaza))
    bump(
      CHIWARI_HEAD.test(oaza)
        ? 'oaza_cho=第N地割…（先頭）'
        : 'oaza_cho=…第N地割（末尾）',
    )
  else bump('その他')
}
for (const [k, v] of forms) console.log(`${k} ${v}`)

console.log(`\n## place タグが空になるケース`)
const koazaOnly = chiwari.filter(({ t }) => CHIWARI_ONLY.test(t.koaza ?? ''))
console.log(
  `oaza_cho と koaza の両方に地割 ${chiwari.filter(({ t }) => CHIWARI.test(t.oaza_cho ?? '') && CHIWARI.test(t.koaza ?? '')).length}`,
)
console.log(
  `koaza が「第N地割」のみ ${koazaOnly.length} → うち oaza_cho あり ${koazaOnly.filter(({ t }) => (t.oaza_cho ?? '') !== '').length}`,
)
console.log(
  `oaza_cho が「第N地割」のみで koaza なし ${chiwari.filter(({ t }) => CHIWARI_ONLY.test(t.oaza_cho ?? '') && (t.koaza ?? '') === '').length}`,
)

console.log(`\n## 表記の揺れ`)
const digits = new Map([
  ['全角算用', 0],
  ['半角算用', 0],
  ['漢数字', 0],
])
let dai = 0
let daiNashiKanji = 0
const kanji: Row[] = []
for (const r of chiwari) {
  const { t } = r
  const m = `${t.oaza_cho ?? ''}${t.chome ?? ''}${t.koaza ?? ''}`.match(CHIWARI)![0]
  const kind = /[０-９]/.test(m) ? '全角算用' : /[0-9]/.test(m) ? '半角算用' : '漢数字'
  digits.set(kind, digits.get(kind)! + 1)
  if (kind === '漢数字') kanji.push(r)
  if (m.startsWith('第')) dai++
  else if (kind === '漢数字') daiNashiKanji++
}
for (const [k, v] of digits) console.log(`${k} ${v}`)
console.log(`第あり ${dai} / 第なし ${chiwari.length - dai}`)
console.log(`第なし × 漢数字 ${daiNashiKanji}`)

const tally = (rows: Row[], key: (r: Row) => string) => {
  const m = new Map<string, number>()
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1])
}

console.log(
  `\n## 漢数字 ${kanji.length} / うち machiaza_id が MLIT: ${kanji.filter(({ t }) => String(t.machiaza_id ?? '').startsWith('MLIT:')).length}`,
)
for (const [k, v] of tally(kanji, (r) => `${r.pref}${r.city}`)) console.log(`  ${k} ${v}`)

console.log(`\n## 末尾に地割が来る自治体`)
const tail = chiwari.filter(
  ({ t }) => CHIWARI.test(t.oaza_cho ?? '') && !CHIWARI_HEAD.test(t.oaza_cho ?? ''),
)
for (const [k, v] of tally(tail, (r) => `${r.pref}${r.city}`)) console.log(`  ${k} ${v}`)

console.log(`\n## 都道府県の分布`)
for (const [k, v] of tally(chiwari, (r) => r.pref)) console.log(`  ${k} ${v}`)

console.log(`\n## 誤爆する分の都道府県`)
for (const [k, v] of tally(lookalike, (r) => r.pref)) console.log(`  ${k} ${v}`)
for (const [k, v] of tally(lookalike, (r) => `${r.pref} ${r.t.oaza_cho ?? ''}${r.t.koaza ?? ''}`).slice(0, 8))
  console.log(`    例 ${k} ${v}`)
