import type { NormalizeResult } from '@geolonia/normalize-japanese-addresses'

/** NJA が返す町字レコード */
export type MachiAza = NonNullable<NormalizeResult['metadata']['machiAza']>

/**
 * OSM のタグ。addr:* と note / fixme のみを含む。
 * numberSource / noNumberReason はタグではないのでここに入れない。
 */
export type OsmTags = {
  'addr:country'?: string
  'addr:province'?: string
  'addr:county'?: string
  'addr:city'?: string
  'addr:suburb'?: string
  'addr:quarter'?: string
  'addr:neighbourhood'?: string
  'addr:block_number'?: string
  'addr:housenumber'?: string
  note?: string
  fixme?: string
}

/** 番地（block_number + housenumber）の根拠 */
export type NumberSource =
  /** ABR の住居表示明細と照合した番地 */
  | 'verified'
  /** 明細データがなく入力文字列から分解した番地。町字が住居表示実施済みなのは確定 */
  | 'inferred'
  /** 番地タグを出していない */
  | 'none'

/** 番地を出さなかった理由 */
export type NoNumberReason =
  /** 地番方式。ライセンス上、変換せず落とす */
  | 'chiban'
  /** 住居表示未実施の町字 */
  | 'rsdt-not-implemented'
  /** 住居表示実施済みだが番地を分解できなかった */
  | 'rsdt-detail-missing'
  /** 町字すら特定できず */
  | 'machiaza-unresolved'

export type AddressNames = {
  prefecture?: string
  county?: string
  city?: string
  ward?: string
  oazaCho?: string
  koaza?: string
}

export type ConversionExtra = {
  point?: { lat: number; lng: number; level: number }
  /** 全国地方公共団体コード */
  prefectureCode?: number
  cityCode?: number
  /** ABR の町字ID */
  machiazaId?: string
  kana?: AddressNames
  romaji?: AddressNames
}

export type ConversionResult = {
  tags: OsmTags
  numberSource: NumberSource
  /** numberSource === 'none' のときのみ入る */
  noNumberReason?: NoNumberReason
  extra: ConversionExtra
}

export type Options = {
  /** note タグを出すか。既定 true */
  note?: boolean
  /** fixme タグを出すか。既定 true */
  fixme?: boolean
  /** addr:country=JP を出すか。既定 true */
  country?: boolean
}

/** テスト用フィクスチャ1件 */
export type FixtureCase = {
  label: string
  input: string
  result: NormalizeResult
}
