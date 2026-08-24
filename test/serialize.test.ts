import { describe, expect, it } from 'vitest'
import {
  META_COLUMNS,
  OSM_TAG_COLUMNS,
  noNumberReasonLabel,
  numberSourceLabel,
  resolveCoord,
  toColumns,
  toGeoJsonFeature,
} from '../src/serialize.ts'
import type { ConversionResult } from '../src/types.ts'

const verified: ConversionResult = {
  tags: {
    'addr:country': 'JP',
    'addr:province': '東京都',
    'addr:city': '千代田区',
    'addr:neighbourhood': '紀尾井町',
    'addr:block_number': '1',
    'addr:housenumber': '3',
  },
  numberSource: 'verified',
  extra: { point: { lat: 35.679, lng: 139.736, level: 8 } },
}

const chiban: ConversionResult = {
  tags: { 'addr:province': '和歌山県', 'addr:neighbourhood': '串本', note: '1800' },
  numberSource: 'none',
  noNumberReason: 'chiban',
  extra: { point: { lat: 33.47, lng: 135.78, level: 3 } },
}

describe('列定義', () => {
  it('タグ列は addr:* と note / fixme', () => {
    expect(OSM_TAG_COLUMNS).toContain('addr:province')
    expect(OSM_TAG_COLUMNS).toContain('addr:block_number')
    expect(OSM_TAG_COLUMNS).toContain('note')
    expect(OSM_TAG_COLUMNS).toContain('fixme')
  })

  it('備考列は _ 接頭辞つき', () => {
    expect(META_COLUMNS).toEqual(['_番地の根拠', '_備考', '_lat', '_lng', '_座標精度'])
  })

  it('タグ列に備考列が混ざらない', () => {
    for (const c of META_COLUMNS) expect(OSM_TAG_COLUMNS).not.toContain(c)
  })
})

describe('ラベル', () => {
  it('numberSource', () => {
    expect(numberSourceLabel('verified')).toBe('照合済み')
    expect(numberSourceLabel('inferred')).toBe('推定')
    expect(numberSourceLabel('none')).toBe('なし')
  })

  it('noNumberReason', () => {
    expect(noNumberReasonLabel('chiban')).toBe('地番方式のため対象外')
    expect(noNumberReasonLabel('rsdt-not-implemented')).toBe('住居表示未実施の町字')
    expect(noNumberReasonLabel('rsdt-detail-missing')).toBe('住居表示実施済みだが番地を分解できず')
    expect(noNumberReasonLabel('machiaza-unresolved')).toBe('町字を特定できず')
  })

  it('noNumberReason が無ければ空文字列', () => {
    expect(noNumberReasonLabel(undefined)).toBe('')
  })
})

describe('toColumns', () => {
  it('タグを列に展開し、出ていないタグは空文字列にする', () => {
    const c = toColumns(verified)
    expect(c['addr:province']).toBe('東京都')
    expect(c['addr:block_number']).toBe('1')
    expect(c['addr:suburb']).toBe('')
    expect(c.note).toBe('')
  })

  it('備考列を埋める', () => {
    expect(toColumns(verified)['_番地の根拠']).toBe('照合済み')
    expect(toColumns(verified)['_備考']).toBe('')
    expect(toColumns(chiban)['_番地の根拠']).toBe('なし')
    expect(toColumns(chiban)['_備考']).toBe('地番方式のため対象外')
  })

  it('座標が渡されなければ extra.point で補完し、精度を入れる', () => {
    const c = toColumns(verified)
    expect(c._lat).toBe('35.679')
    expect(c._lng).toBe('139.736')
    expect(c._座標精度).toBe('8')
  })

  it('有効な座標が渡されればそれを使い、精度は空にする', () => {
    const c = toColumns(verified, { lat: 35.1, lng: 139.1 })
    expect(c._lat).toBe('35.1')
    expect(c._lng).toBe('139.1')
    expect(c._座標精度).toBe('')
  })

  it('座標が 0 なら無効として補完する', () => {
    const c = toColumns(verified, { lat: 0, lng: 0 })
    expect(c._lat).toBe('35.679')
    expect(c._座標精度).toBe('8')
  })

  it('extra.point も無ければ座標列は空', () => {
    const c = toColumns({ ...verified, extra: {} })
    expect(c._lat).toBe('')
    expect(c._lng).toBe('')
    expect(c._座標精度).toBe('')
  })
})

describe('resolveCoord', () => {
  it('coord が有効ならそれを使い level は入らない', () => {
    expect(resolveCoord(verified, { lat: 35.1, lng: 139.1 })).toEqual({ lat: 35.1, lng: 139.1 })
  })

  it('coord が 0 なら extra.point で補完し level が入る', () => {
    expect(resolveCoord(verified, { lat: 0, lng: 0 }))
      .toEqual({ lat: 35.679, lng: 139.736, level: 8 })
  })

  it('coord を渡さなければ extra.point で補完する', () => {
    expect(resolveCoord(verified)).toEqual({ lat: 35.679, lng: 139.736, level: 8 })
  })

  it('片方だけの coord は無効として扱う', () => {
    expect(resolveCoord(verified, { lat: 35.1 }))
      .toEqual({ lat: 35.679, lng: 139.736, level: 8 })
  })

  it('extra.point も無ければ undefined', () => {
    expect(resolveCoord({ ...verified, extra: {} })).toBeUndefined()
  })
})

describe('toGeoJsonFeature', () => {
  it('Point Feature を作り、タグと備考を properties に入れる', () => {
    const f = toGeoJsonFeature(chiban, { lat: 33.47, lng: 135.78 })
    expect(f.type).toBe('Feature')
    expect(f.geometry).toEqual({ type: 'Point', coordinates: [135.78, 33.47] })
    expect(f.properties['addr:province']).toBe('和歌山県')
    expect(f.properties.note).toBe('1800')
    expect(f.properties['_番地の根拠']).toBe('なし')
    expect(f.properties['_備考']).toBe('地番方式のため対象外')
  })

  it('出ていないタグは properties に入れない', () => {
    const f = toGeoJsonFeature(chiban, { lat: 33.47, lng: 135.78 })
    expect('addr:block_number' in f.properties).toBe(false)
  })

  it('座標が決まらなければ geometry を null にする', () => {
    const f = toGeoJsonFeature({ ...verified, extra: {} })
    expect(f.geometry).toBeNull()
    // 行を落とさないので properties は残る
    expect(f.properties['addr:province']).toBe('東京都')
  })

  it('代表点で補完したときは _座標精度 を入れる', () => {
    const f = toGeoJsonFeature(verified)
    expect(f.properties['_座標精度']).toBe('8')
    expect(f.geometry).toEqual({ type: 'Point', coordinates: [139.736, 35.679] })
  })

  it('元データの座標を使ったときは _座標精度 を入れない', () => {
    const f = toGeoJsonFeature(verified, { lat: 35.1, lng: 139.1 })
    expect('_座標精度' in f.properties).toBe(false)
    expect(f.geometry).toEqual({ type: 'Point', coordinates: [139.1, 35.1] })
  })

  it('extraProperties を持ち込み、生成した値が上書きする', () => {
    const f = toGeoJsonFeature(verified, undefined, {
      名称: 'A薬局',
      'addr:province': '上書きされる',
    })
    expect(f.properties['名称']).toBe('A薬局')
    expect(f.properties['addr:province']).toBe('東京都')
  })
})
