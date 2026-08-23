import type {
  ConversionResult,
  NoNumberReason,
  NumberSource,
  OsmTags,
} from './types.ts'

/** CSV / GeoJSON に出すタグ列。addr:* と note / fixme のみ */
export const OSM_TAG_COLUMNS = [
  'addr:country',
  'addr:province',
  'addr:county',
  'addr:city',
  'addr:suburb',
  'addr:quarter',
  'addr:neighbourhood',
  'addr:block_number',
  'addr:housenumber',
  'note',
  'fixme',
] as const satisfies readonly (keyof OsmTags)[]

/** OsmTags のキーを1つでも取りこぼしたら型エラーにする */
type MissingTagColumn = Exclude<keyof OsmTags, (typeof OSM_TAG_COLUMNS)[number]>
const _tagColumnsAreExhaustive: MissingTagColumn extends never ? true : false = true
void _tagColumnsAreExhaustive

/** タグではない備考列。addr:* と混ざらないよう _ を付ける */
export const META_COLUMNS = [
  '_番地の根拠',
  '_備考',
  '_lat',
  '_lng',
  '_座標精度',
] as const

export function numberSourceLabel(s: NumberSource): string {
  switch (s) {
    case 'verified':
      return '照合済み'
    case 'inferred':
      return '推定'
    case 'none':
      return 'なし'
  }
}

export function noNumberReasonLabel(r: NoNumberReason | undefined): string {
  switch (r) {
    case 'chiban':
      return '地番方式のため対象外'
    case 'rsdt-not-implemented':
      return '住居表示未実施の町字'
    case 'rsdt-detail-missing':
      return '住居表示実施済みだが番地を分解できず'
    case 'machiaza-unresolved':
      return '町字を特定できず'
    case undefined:
      return ''
  }
}

/** 数値として有効で 0 でないか */
function usable(n: number | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n !== 0
}

/**
 * ConversionResult を CSV の列に展開する。出ていないタグは空文字列。
 *
 * 座標は coord が有効ならそれを使い、無効なら extra.point で補完する。
 * 補完したときだけ _座標精度 に point.level を入れる。
 */
export function toColumns(
  result: ConversionResult,
  coord?: { lat?: number; lng?: number },
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of OSM_TAG_COLUMNS) out[key] = result.tags[key] ?? ''

  out['_番地の根拠'] = numberSourceLabel(result.numberSource)
  out['_備考'] = noNumberReasonLabel(result.noNumberReason)

  if (usable(coord?.lat) && usable(coord?.lng)) {
    out._lat = String(coord.lat)
    out._lng = String(coord.lng)
    out._座標精度 = ''
  } else if (result.extra.point) {
    out._lat = String(result.extra.point.lat)
    out._lng = String(result.extra.point.lng)
    out._座標精度 = String(result.extra.point.level)
  } else {
    out._lat = ''
    out._lng = ''
    out._座標精度 = ''
  }
  return out
}

export type GeoJsonFeature = {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: Record<string, string>
}

/** GeoJSON の Point Feature を作る。座標は [経度, 緯度] の順 */
export function toGeoJsonFeature(
  result: ConversionResult,
  lat: number,
  lng: number,
): GeoJsonFeature {
  const properties: Record<string, string> = {}
  for (const key of OSM_TAG_COLUMNS) {
    const value = result.tags[key]
    if (value) properties[key] = value
  }
  properties['_番地の根拠'] = numberSourceLabel(result.numberSource)
  const reason = noNumberReasonLabel(result.noNumberReason)
  if (reason) properties['_備考'] = reason

  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties,
  }
}
