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
 * addr:quarter と addr:neighbourhood を決める。
 *
 * - chome あり  -> neighbourhood = oaza_cho + chome
 * - koaza あり  -> quarter = oaza_cho, neighbourhood = koaza
 * - どちらもなし -> neighbourhood = oaza_cho
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
    const tags: MachiAzaTags = { neighbourhood: koaza }
    if (oaza) tags.quarter = oaza
    return tags
  }

  return oaza ? { neighbourhood: oaza } : {}
}
