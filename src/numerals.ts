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

/** カナから算用数字のトークンを取り出す。`ニシ１９ジョウミナミ` -> `['19']` */
function kanaDigitTokens(kana: string): string[] {
  return toHankakuDigits(kana).match(/\d+/g) ?? []
}

/**
 * 漢数字ランのうち、カナが数字として書いているものを算用数字に置換する。
 *
 * カナから算用数字のトークンを取り出し、その個数と値の分だけ漢数字ランを
 * 右から順に選んで、それぞれ自分の位置で置換する。カナは漢字の読みなので、
 * 数字として書かれた数詞は右側の「条」「丁」などに対応する。
 *
 * 素朴に「値がカナに現れるランを replace する」だけでは地名が壊れる。
 * - `二十四軒四条` / `ニジュウヨンケン４ジョウ` — `四`=4 が文字列の最初の
 *   `四`（`二十四` の中）を置換して `二十4軒四条` になる
 * - `八軒八条東` / `ハチケン８ジョウヒガシ` — ランが `八`,`八` の2つで
 *   どちらも 8 だが、カナの数字トークンは1つ。両方置換すると `8軒8条東` になる
 */
export function kanjiToArabicByKana(
  text: string,
  kana: string | undefined,
): string {
  if (!kanaHasArabic(kana)) return text
  const tokens = kanaDigitTokens(kana as string)
  if (tokens.length === 0) return text

  // 漢数字ランを位置つきで集める。findKanjiNumbers は出現順に返す
  const runs: { text: string; index: number; value: number }[] = []
  let cursor = 0
  for (const run of findKanjiNumbers(text)) {
    const index = text.indexOf(run, cursor)
    if (index < 0) continue
    cursor = index + run.length
    try {
      runs.push({ text: run, index, value: kanji2number(run) })
    } catch {
      // 数値に直せないランは対象外
    }
  }

  // カナのトークンとランを右から突き合わせる
  const picked = new Array<string | undefined>(runs.length)
  for (let t = tokens.length - 1; t >= 0; t--) {
    const token = tokens[t]
    for (let r = runs.length - 1; r >= 0; r--) {
      if (picked[r] !== undefined) continue
      if (String(runs[r]!.value) !== token) continue
      picked[r] = token
      break
    }
  }

  // 右から置換すると前方の index がずれない
  let out = text
  for (let r = runs.length - 1; r >= 0; r--) {
    const token = picked[r]
    if (token === undefined) continue
    const run = runs[r]!
    out = out.slice(0, run.index) + token + out.slice(run.index + run.text.length)
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
