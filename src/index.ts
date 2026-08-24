import { normalize } from '@geolonia/normalize-japanese-addresses'
import { applyApiBase } from './apiBase.ts'
import { toOsmTags } from './toOsmTags.ts'
import type { ConversionResult, Options } from './types.ts'

// 読み込み時に取得先を確定させる。bin/batch.ts の行単位 try/catch は
// addressToOsmTags の例外を全て拾って _備考 に書いて続行するため、
// 検証をループの内側でやると取得先の打ち間違いが「全行変換失敗」として
// 静かに完走してしまう。ここなら run() が呼ばれる前に落ちる
applyApiBase()

export { toOsmTags }
export { API_BASE_ENV, applyApiBase, resolveApiBase } from './apiBase.ts'
export {
  META_COLUMNS,
  OSM_TAG_COLUMNS,
  noNumberReasonLabel,
  numberSourceLabel,
  resolveCoord,
  toColumns,
  toGeoJsonFeature,
} from './serialize.ts'
export type { GeoJsonFeature, ResolvedCoord } from './serialize.ts'
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
