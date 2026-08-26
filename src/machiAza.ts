import type { NormalizeResult } from '@geolonia/normalize-japanese-addresses'
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
 * `南郷通十四丁目南` は ABR では `oaza_cho=南郷通` + `koaza=十四丁目南` になる。
 * 丁目のあとに方角が付くため、「数字 + 丁目」の形しか受けない `chome` フィールドに
 * 入らないからで、ABR のスキーマ制約に対する妥当な回避。データの誤りではない。
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
 * 町字パターンが空文字列に一致しうるか。
 *
 * NJA は `○○町` に対して `町` を落とした別名を町字パターンとして登録し
 * （`cacheRegexes.ts` の `getTownRegexPatterns`）、さらに `大?字` を任意にする。
 * 両方が重なると `字町` の別名 `字` が `(大?字)?` になり、空文字列に一致する。
 * その自治体では入力が何であれ町字が決まってしまう。
 *
 * 先頭の `町` は落とさない。上流の別名生成が `(?!^町)` で除いているため。
 * 町字名が `町` そのもののレコードは山形県長井市と石川県羽咋郡志賀町に、
 * `町町` は志賀町に実在し、ここを外すと該当自治体が7から8に増える。
 */
export function matchesEmptyString(name: string): boolean {
  return name.replace(/(?!^町)町/g, '').replace(/大?字/g, '') === ''
}

/**
 * 町字名を連結する。`@geolonia/japanese-addresses-v2` の `machiAzaName` と
 * 同じ規則。あちらは直接の依存ではないので写しを持つ。
 */
export function machiAzaFullName(machiAza: MachiAza): string {
  return `${machiAza.oaza_cho ?? ''}${machiAza.chome ?? ''}${machiAza.koaza ?? ''}`
}

/**
 * 文字列中の `needle` の全出現位置を返す。空文字列は無限ループになるので除く
 */
function allIndicesOf(haystack: string, needle: string): number[] {
  if (!needle) return []
  const indices: number[] = []
  let at = haystack.indexOf(needle)
  while (at >= 0) {
    indices.push(at)
    at = haystack.indexOf(needle, at + 1)
  }
  return indices
}

/**
 * 入力から1文字も取らずに決まった町字を落とす。
 *
 * `matchesEmptyString` に当たる町字は、入力が何であれ決まってしまう。
 * 全1,892自治体を悉皆で確認した結果、7自治体が該当する
 * （つがる市・七戸町・塩竈市・岩沼市・大河原町・志賀町・大津町）。
 * 詳細は docs/town-overmatch.md にある。
 *
 * ただし `宮城県塩竈市字町1-2` のように入力が町字を書いている場合は、
 * 基底パターン `(大?字)?町` が2文字を丸ごと消費して正しく解決する。
 * これを落とさないため、入力の市区町村の直後に町字名（`大字`/`字` の
 * 付け外しを含む）が書かれていないことを条件に加える。
 *
 * ### 市区町村名をどこで探すか（3回失敗した）
 *
 * 1. 入力全体の最初の出現（indexOf）: 施設名が入力の前方にあると、
 *    施設名側の市区町村名に釣られる（`七戸町役場 青森県七戸町字町1-2`）。
 * 2. 入力全体の最後の出現（lastIndexOf）: 逆に施設名が後方にあると、
 *    そちらに釣られる（`青森県七戸町字町1-2七戸町役場`）。
 * 3. 都道府県名の直後を錨にする: 入力に都道府県名が無いと錨自体が立たず
 *    （`七戸町役場 七戸町字町1-2`）、施設名の中にも都道府県名が出れば
 *    錨が施設名の内側に落ちる（`青森県七戸町役場 青森県七戸町字町1-2`）。
 *
 * 市区町村名の出現をどれか1つに絞る限り、施設名の位置と都道府県名の有無の
 * 組み合わせだけ誤爆する例が作れる。だから絞らず、**市区町村名の全出現を
 * 走査する**。`full`（郡+市区町村+区）と `short`（市区町村+区）の両方について
 * 入力中のすべての出現を試し、どれか1つでも直後に町字名の形が続けば落とさない。
 * 全ての出現で続かないときだけ落とす。
 *
 * これは「残す側に倒す」判定でもある。誤って落とせば正しい町字タグを失い、
 * 誤って残せば捏造された町字が残る。どちらの誤りも完全には避けられないので、
 * 実害が小さい方（捏造が残ることは docs/known-limitations.md に既知の限界
 * として書ける）を選ぶ。
 *
 * 落とした結果は「町字を特定できず」と同じ扱いになる。`decideNumbers` は
 * `hasMachiAzaName` を見ているので、ここで落とせば `machiaza-unresolved` を返す。
 * `point` も同じ扱いに揃え、市区町村代表点（level 2）に差し替える。
 * 揃えないと「町字を特定できず」なのに座標だけ町字レベルの精度で出る
 * 自己矛盾が起きる。
 */
export function dropFabricatedMachiAza(result: NormalizeResult): NormalizeResult {
  const machiAza = result.metadata.machiAza
  if (!hasMachiAzaName(machiAza)) return result

  const name = machiAzaFullName(machiAza)
  if (!matchesEmptyString(name)) return result

  const input = result.metadata.input ?? ''
  const city = result.metadata.city
  if (!city) return result

  // 郡を省いた入力もあるので、長い形と短い形の両方を対象にする
  const full = `${city.county ?? ''}${city.city}${city.ward ?? ''}`
  const short = `${city.city}${city.ward ?? ''}`
  const ends = [
    ...allIndicesOf(input, full).map((at) => at + full.length),
    ...allIndicesOf(input, short).map((at) => at + short.length),
  ]
  if (ends.length === 0) return result

  // `大字`/`字` は付いたり付かなかったりする。`塩竈市字町` `塩竈市町`
  // `塩竈市大字町` はどれも同じ町字に解決するので、全部を形として持つ。
  // 空になる形は使わない。空文字列はどの入力の先頭にも一致する
  const bare = name.replace(/大?字/g, '')
  const forms = [name, bare, `大字${bare}`, `字${bare}`].filter((f) => f.length > 0)

  // 市区町村名の各出現の直後（残りは、その出現自体を含まないので、
  // 自治体名に `町` を含んでいても誤爆しない）を調べる
  const writtenAfterCity = ends.some((end) => {
    const rest = input.slice(end).trimStart()
    return forms.some((f) => rest.startsWith(f))
  })
  if (writtenAfterCity) return result

  // 落とした町字の代表点（level 3）が point に残ると、「町字を特定できず」
  // なのに座標だけ町字レベルの精度で出るという自己矛盾が起きる。
  // NJA が本当に町字未特定のときに返す形に合わせ、市区町村代表点（level 2）に
  // 差し替える。city.point が無ければ座標自体を落とす
  const cityPoint = city.point
  const point = cityPoint
    ? { lat: cityPoint[1], lng: cityPoint[0], level: 2 }
    : undefined

  return {
    ...result,
    point,
    metadata: { ...result.metadata, machiAza: undefined },
  }
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
