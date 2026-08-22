import { normalize } from '@geolonia/normalize-japanese-addresses'
import { toOsmTags } from './toOsmTags.ts'
import type { ConversionResult, Options } from './types.ts'

export { toOsmTags }
export {
  META_COLUMNS,
  OSM_TAG_COLUMNS,
  noNumberReasonLabel,
  numberSourceLabel,
  toColumns,
  toGeoJsonFeature,
} from './serialize.ts'
export type { GeoJsonFeature } from './serialize.ts'
export type {
  AddressNames,
  ConversionExtra,
  ConversionResult,
  MachiAza,
  NoNumberReason,
  NumberSource,
  Options,
  OsmTags,
} from './types.ts'

/**
 * 住所文字列を OSM の addr:* タグへ変換する。
 * NJA の住所データ API にアクセスするためネットワークを使う。
 */
export async function addressToOsmTags(
  input: string,
  options?: Options,
): Promise<ConversionResult> {
  return toOsmTags(await normalize(input), options)
}
