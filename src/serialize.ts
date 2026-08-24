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

export type ResolvedCoord = {
  lat: number
  lng: number
  /** NJA の代表点で補完した場合のみ入る。元データの座標を使った場合は undefined */
  level?: number
}

/**
 * 座標を決める。
 *
 * `coord` の値が数値として有効で 0 でなければそれを使い、無効なら
 * `extra.point` で補完する。どちらも無ければ `undefined`。
 *
 * CSV と GeoJSON の両方がこの述語を使う。規則を2箇所に書くと片方が腐る。
 * 地番方式の住所では `extra.point` が空になるため、補完も効かない
 * （ライセンス上の措置。判定は src/point.ts）。
 */
export function resolveCoord(
  result: ConversionResult,
  coord?: { lat?: number; lng?: number },
): ResolvedCoord | undefined {
  if (usable(coord?.lat) && usable(coord?.lng)) {
    return { lat: coord.lat, lng: coord.lng }
  }
  const p = result.extra.point
  return p ? { lat: p.lat, lng: p.lng, level: p.level } : undefined
}

/**
 * ConversionResult を CSV の列に展開する。出ていないタグは空文字列。
 *
 * 座標は resolveCoord に従う。代表点で補完したときだけ _座標精度 が入る。
 */
export function toColumns(
  result: ConversionResult,
  coord?: { lat?: number; lng?: number },
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of OSM_TAG_COLUMNS) out[key] = result.tags[key] ?? ''

  out['_番地の根拠'] = numberSourceLabel(result.numberSource)
  out['_備考'] = noNumberReasonLabel(result.noNumberReason)

  const resolved = resolveCoord(result, coord)
  out._lat = resolved ? String(resolved.lat) : ''
  out._lng = resolved ? String(resolved.lng) : ''
  out._座標精度 = resolved?.level !== undefined ? String(resolved.level) : ''
  return out
}

export type GeoJsonFeature = {
  type: 'Feature'
  /** 座標が決まらなかった場合は null。RFC 7946 が許す形 */
  geometry: { type: 'Point'; coordinates: [number, number] } | null
  properties: Record<string, string>
}

/**
 * GeoJSON の Point Feature を作る。座標は [経度, 緯度] の順。
 *
 * 座標は resolveCoord に従う。決まらなければ `geometry` を `null` にする。
 * 行を落とさないためで、RFC 7946 が許す形。
 *
 * `extraProperties` は元データの列を持ち込むためのもの。生成した値が
 * 同名のキーを上書きする。
 */
export function toGeoJsonFeature(
  result: ConversionResult,
  coord?: { lat?: number; lng?: number },
  extraProperties?: Record<string, string>,
): GeoJsonFeature {
  const properties: Record<string, string> = { ...extraProperties }
  for (const key of OSM_TAG_COLUMNS) {
    const value = result.tags[key]
    if (value) properties[key] = value
  }
  properties['_番地の根拠'] = numberSourceLabel(result.numberSource)
  const reason = noNumberReasonLabel(result.noNumberReason)
  if (reason) properties['_備考'] = reason

  const resolved = resolveCoord(result, coord)
  if (resolved?.level !== undefined) {
    properties['_座標精度'] = String(resolved.level)
  }

  return {
    type: 'Feature',
    geometry: resolved
      ? { type: 'Point', coordinates: [resolved.lng, resolved.lat] }
      : null,
    properties,
  }
}
