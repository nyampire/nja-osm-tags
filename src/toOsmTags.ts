import type { NormalizeResult } from '@geolonia/normalize-japanese-addresses'
import { machiAzaTags } from './machiAza.ts'
import { buildNotes } from './notes.ts'
import { decideNumbers } from './numbers.ts'
import type {
  AddressNames,
  ConversionExtra,
  ConversionResult,
  Options,
  OsmTags,
} from './types.ts'

/** undefined と空文字列を落として代入する */
function set(tags: OsmTags, key: keyof OsmTags, value: string | undefined): void {
  if (value) tags[key] = value
}

function names(
  result: NormalizeResult,
  pick: 'k' | 'r',
): AddressNames | undefined {
  const { prefecture, city, machiAza } = result.metadata
  const out: AddressNames = {}
  if (prefecture) out.prefecture = pick === 'k' ? prefecture.pref_k : prefecture.pref_r
  if (city) {
    out.city = pick === 'k' ? city.city_k : city.city_r
    if (city.county) out.county = pick === 'k' ? city.county_k : city.county_r
    if (city.ward) out.ward = pick === 'k' ? city.ward_k : city.ward_r
  }
  if (machiAza) {
    if (machiAza.oaza_cho) {
      out.oazaCho = pick === 'k' ? machiAza.oaza_cho_k : machiAza.oaza_cho_r
    }
    if (machiAza.koaza) {
      out.koaza = pick === 'k' ? machiAza.koaza_k : machiAza.koaza_r
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * NJA の正規化結果を OSM の addr:* タグへ変換する。
 *
 * 純粋関数。ネットワークにもファイルシステムにも触れない。
 */
export function toOsmTags(
  result: NormalizeResult,
  options: Options = {},
): ConversionResult {
  const { prefecture, city, machiAza, rsdt, chiban } = result.metadata
  const tags: OsmTags = {}

  if (options.country !== false) tags['addr:country'] = 'JP'
  set(tags, 'addr:province', prefecture?.pref)
  set(tags, 'addr:county', city?.county)
  set(tags, 'addr:city', city?.city)
  set(tags, 'addr:suburb', city?.ward)

  const machi = machiAzaTags(machiAza)
  set(tags, 'addr:quarter', machi.quarter)
  set(tags, 'addr:neighbourhood', machi.neighbourhood)

  const numbers = decideNumbers(result)
  set(tags, 'addr:block_number', numbers.blockNumber)
  set(tags, 'addr:housenumber', numbers.housenumber)

  const notes = buildNotes(numbers.residue, numbers.extraElements, options)
  set(tags, 'note', notes.note)
  set(tags, 'fixme', notes.fixme)

  const extra: ConversionExtra = {}
  // 地番由来の座標は出さない。level 8 は rsdt か chiban のどちらかを伴うので、
  // rsdt に裏付けられていない level 8 は地番由来と判断する（保守的な措置）。
  // chiban を明示的に除外するのは、番地の決定表（src/numbers.ts）が
  // chiban を最上位に置いて rsdt より優先しているのと揃えるため。
  // ここで rsdt だけを見ると、両方が返るケースで番地は落ちるのに
  // 座標だけ通ってしまう。
  if (result.point && (result.point.level !== 8 || (rsdt && !chiban))) {
    extra.point = {
      lat: result.point.lat,
      lng: result.point.lng,
      level: result.point.level,
    }
  }
  if (prefecture) extra.prefectureCode = prefecture.code
  if (city) extra.cityCode = city.code
  if (machiAza) extra.machiazaId = machiAza.machiaza_id
  const kana = names(result, 'k')
  if (kana) extra.kana = kana
  const romaji = names(result, 'r')
  if (romaji) extra.romaji = romaji

  const out: ConversionResult = {
    tags,
    numberSource: numbers.numberSource,
    extra,
  }
  if (numbers.noNumberReason) out.noNumberReason = numbers.noNumberReason
  return out
}
