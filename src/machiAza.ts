import {
  formatChome,
  kanaHasArabic,
  kanjiToArabicByKana,
  toHankakuDigits,
} from './numerals.ts'
import type { MachiAza } from './types.ts'

export type MachiAzaTags = {
  quarter?: string
  neighbourhood?: string
}

/**
 * 町字名を1つでも持っているか。
 *
 * NJA は市区町村までしか特定できなかった場合、`machiAza` を省略するのではなく
 * `{ machiaza_id: '0000000' }` というプレースホルダを返すことがある
 * （実測1000件中4件）。どちらの形も「町字を特定できなかった」という同じ事実。
 *
 * `decideNumbers`（src/numbers.ts）も同じ述語を使う。`machiAza` の有無だけを見ると
 * プレースホルダの形が `rsdt-not-implemented` に誤分類される。
 *
 * 型ガードにしているのは、呼び出し側でオプショナルチェーンを重ねずに
 * `machiAza` を絞り込めるようにするため。
 */
export function hasMachiAzaName(
  machiAza: MachiAza | undefined,
): machiAza is MachiAza {
  if (!machiAza) return false
  return !!(machiAza.oaza_cho || machiAza.chome || machiAza.koaza)
}

/**
 * `koaza` に丁目の続きが入っているか。
 *
 * ABR は同じ町名を2通りで持つことがある。札幌市白石区の `南郷通` は80レコードのうち
 * 40件が `oaza_cho=南郷通` + `koaza=十四丁目南`、残り40件が
 * `oaza_cho=南郷通十四丁目南` の1フィールドだった。前者を分割すると、
 * 同じ場所で出力が2通りに割れる。
 *
 * OSM wiki は北海道について「条と丁目をまとめて町名として addr:neighbourhood に
 * 入れる」と定めており、公式サンプルも松戸市北松戸三丁目に「厳密には大字「北松戸」・
 * 小字「三丁目」だが例外ルールにより neighbourhood に入れる」と注記している。
 *
 * 先頭が数字であることを要求するので、`字方八丁`（方八丁という地名）や
 * `八丁目堰山`（郡山市の小字）は該当しない。
 */
function isChomeLikeKoaza(koaza: string): boolean {
  return /^[一二三四五六七八九十百千0-9０-９]+丁目?[北南東西]?$/.test(koaza)
}

/**
 * addr:quarter と addr:neighbourhood を決める。
 *
 * - chome あり        -> neighbourhood = oaza_cho + chome
 * - koaza が丁目の続き -> neighbourhood = oaza_cho + koaza
 * - koaza あり        -> quarter = oaza_cho, neighbourhood = koaza
 * - どちらもなし       -> neighbourhood = oaza_cho
 *
 * 「大字」「字」の接頭辞は除去しない。
 */
export function machiAzaTags(machiAza: MachiAza | undefined): MachiAzaTags {
  if (!hasMachiAzaName(machiAza)) return {}

  const oazaArabic = kanaHasArabic(machiAza.oaza_cho_k)
  const oaza = machiAza.oaza_cho
    ? toHankakuDigits(kanjiToArabicByKana(machiAza.oaza_cho, machiAza.oaza_cho_k))
    : undefined

  if (machiAza.chome) {
    const chome = toHankakuDigits(
      formatChome(machiAza.chome, machiAza.chome_n, oazaArabic),
    )
    const neighbourhood = `${oaza ?? ''}${chome}`
    return neighbourhood ? { neighbourhood } : {}
  }

  if (machiAza.koaza) {
    const koaza = toHankakuDigits(
      kanjiToArabicByKana(machiAza.koaza, machiAza.koaza_k),
    )
    if (isChomeLikeKoaza(machiAza.koaza)) {
      const neighbourhood = `${oaza ?? ''}${koaza}`
      return neighbourhood ? { neighbourhood } : {}
    }
    const tags: MachiAzaTags = { neighbourhood: koaza }
    if (oaza) tags.quarter = oaza
    return tags
  }

  return oaza ? { neighbourhood: oaza } : {}
}
