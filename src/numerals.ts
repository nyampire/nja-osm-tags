import { findKanjiNumbers, kanji2number } from '@geolonia/japanese-numeral'

/**
 * 全角数字を半角に直す。
 *
 * ABR には町字名が全角算用数字で入っているものがある（`第７地割`）。
 * そのカナは漢数字読み（`ダイナナチワリ`）なので kanjiToArabicByKana では
 * 拾えない。カナ判定とは独立した文字種正規化として常に適用する。
 */
export function toHankakuDigits(text: string): string {
  return text.replace(/[０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  )
}

/**
 * カナに算用数字が含まれるか。
 * ABR のカナは告示の数字表記を保持しているため、これが数字表記の判定根拠になる。
 */
export function kanaHasArabic(kana: string | undefined): boolean {
  if (!kana) return false
  return /[0-9０-９]/.test(kana)
}

/**
 * 漢数字ランのうち、その数値がカナに算用数字として現れるものだけを算用数字に置換する。
 *
 * 全置換にしないのは地名を壊さないため。`八千代町` の `八千` は 8000 だが
 * カナは `ヤチヨチョウ` なので置換しない。
 */
export function kanjiToArabicByKana(
  text: string,
  kana: string | undefined,
): string {
  if (!kanaHasArabic(kana)) return text
  const kanaHan = toHankakuDigits(kana as string)
  let out = text
  for (const run of findKanjiNumbers(text)) {
    let value: number
    try {
      value = kanji2number(run)
    } catch {
      continue
    }
    if (!kanaHan.includes(String(value))) continue
    out = out.replace(run, String(value))
  }
  return out
}

/**
 * 丁目を整形する。`丁` と `丁目` の区別は chome の接尾辞をそのまま使って保つ。
 *
 * @param chome ABR の丁目名（常に漢数字）。例 `四十二丁目`
 * @param chomeN ABR の丁目番号。欠けていることがある
 * @param toArabic 算用数字にするか
 */
export function formatChome(
  chome: string,
  chomeN: number | undefined,
  toArabic: boolean,
): string {
  if (!toArabic) return chome

  const runs = findKanjiNumbers(chome)
  const run = runs[0]
  if (run === undefined) return chome

  let value = chomeN
  if (value === undefined) {
    try {
      value = kanji2number(run)
    } catch {
      return chome
    }
  }
  const suffix = chome.slice(chome.indexOf(run) + run.length)
  return `${value}${suffix}`
}
