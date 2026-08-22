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
 * addr:quarter と addr:neighbourhood を決める。
 *
 * - chome あり  -> neighbourhood = oaza_cho + chome
 * - koaza あり  -> quarter = oaza_cho, neighbourhood = koaza
 * - どちらもなし -> neighbourhood = oaza_cho
 *
 * 「大字」「字」の接頭辞は除去しない。
 */
export function machiAzaTags(machiAza: MachiAza | undefined): MachiAzaTags {
  if (!machiAza) return {}

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
