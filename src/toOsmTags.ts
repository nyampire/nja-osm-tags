import type { NormalizeResult } from '@geolonia/normalize-japanese-addresses'
import { dropFabricatedMachiAza, hasMachiAzaName, machiAzaTags } from './machiAza.ts'
import { buildNotes } from './notes.ts'
import { decideNumbers } from './numbers.ts'
import { isPointEmittable } from './point.ts'
import type {
  AddressNames,
  ConversionExtra,
  ConversionResult,
  Options,
  OsmTags,
} from './types.ts'

/**
 * undefined と空文字列を落として代入する。値は NFC 正規形に直す。
 *
 * ABR は一部の町字名を CJK互換漢字で持つ（「塚」U+FA10 など）。標準形と
 * 正規等価な文字なので、そのまま出すと見た目が同じまま別のコードポイントが
 * OSM に入り、既存データと照合できなくなる。
 *
 * NFC は正規等価な文字の符号化を揃えるだけで、正規分解を持たない異体字
 * （「﨑」U+FA11 など）は変化させない。異体字の地名は保たれる。
 *
 * タグを出す経路をここに集約してあるので、note に載る利用者の入力文字列も
 * 同じ規則で正規化される。
 */
function set(tags: OsmTags, key: keyof OsmTags, value: string | undefined): void {
  if (value) tags[key] = value.normalize('NFC')
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
  input: NormalizeResult,
  options: Options = {},
): ConversionResult {
  // 入力から1文字も取らずに決まった町字はここで落とす。
  // machiAza を見るのは machiAzaTags・decideNumbers・extra.machiazaId・names の
  // 4箇所あるので、判定を各所に配らず入口で1回だけ潰して全員に同じものを見せる
  const result = dropFabricatedMachiAza(input)
  const { prefecture, city, machiAza } = result.metadata
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
  // 判定は src/point.ts に集約。scripts/maskChiban.ts と同じ述語を使う
  if (result.point && isPointEmittable(result.point, result.metadata)) {
    extra.point = {
      lat: result.point.lat,
      lng: result.point.lng,
      level: result.point.level,
    }
  }
  if (prefecture) extra.prefectureCode = prefecture.code
  if (city) extra.cityCode = city.code
  if (hasMachiAzaName(machiAza)) extra.machiazaId = machiAza.machiaza_id
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
