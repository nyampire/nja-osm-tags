import { describe, expect, it } from 'vitest'
import { toOsmTags } from '../src/toOsmTags.ts'
import { fixture } from './helpers.ts'

describe('toOsmTags 階層タグ', () => {
  it('特別区', () => {
    const { tags } = toOsmTags(fixture('verified/丁目なし').result)
    expect(tags['addr:country']).toBe('JP')
    expect(tags['addr:province']).toBe('東京都')
    expect(tags['addr:city']).toBe('千代田区')
    expect(tags['addr:suburb']).toBeUndefined()
    expect(tags['addr:county']).toBeUndefined()
  })

  it('政令指定都市は city と suburb に分ける', () => {
    const { tags } = toOsmTags(fixture('verified/政令市の区+丁目').result)
    expect(tags['addr:city']).toBe('大阪市')
    expect(tags['addr:suburb']).toBe('浪速区')
  })

  it('郡は county に入れ、city には町村名だけを入れる', () => {
    const { tags } = toOsmTags(fixture('chiban/郡あり').result)
    expect(tags['addr:county']).toBe('東牟婁郡')
    expect(tags['addr:city']).toBe('串本町')
  })

  it('options.country が false なら addr:country を出さない', () => {
    const { tags } = toOsmTags(fixture('verified/丁目なし').result, { country: false })
    expect(tags['addr:country']).toBeUndefined()
  })
})

describe('toOsmTags 番地と注記', () => {
  it('verified', () => {
    const r = toOsmTags(fixture('verified/丁目なし').result)
    expect(r.tags['addr:neighbourhood']).toBe('紀尾井町')
    expect(r.tags['addr:block_number']).toBe('1')
    expect(r.tags['addr:housenumber']).toBe('3')
    expect(r.numberSource).toBe('verified')
    expect(r.noNumberReason).toBeUndefined()
    expect(r.tags.note).toBeUndefined()
  })

  it('verified + 残余は note に入る', () => {
    const r = toOsmTags(fixture('verified/残余あり').result)
    expect(r.numberSource).toBe('verified')
    expect(r.tags.note).toContain('東京ガーデンテラス')
    expect(r.tags.fixme).toBeUndefined()
  })

  it('inferred 2要素', () => {
    const r = toOsmTags(fixture('inferred/2要素+残余').result)
    expect(r.tags['addr:block_number']).toBe('10')
    expect(r.tags['addr:housenumber']).toBe('28')
    expect(r.numberSource).toBe('inferred')
    expect(r.tags.note).toBe('はりまビル')
    expect(r.tags.fixme).toBeUndefined()
  })

  it('inferred 3要素は fixme を出す', () => {
    const r = toOsmTags(fixture('inferred/3要素').result)
    expect(r.tags['addr:block_number']).toBe('1')
    expect(r.tags['addr:housenumber']).toBe('8')
    expect(r.numberSource).toBe('inferred')
    expect(r.tags.fixme).toBe('番地の3要素目以降を確認: 102')
  })

  it('地番方式は番地タグを出さない', () => {
    const r = toOsmTags(fixture('chiban/郡あり').result)
    expect(r.tags['addr:block_number']).toBeUndefined()
    expect(r.tags['addr:housenumber']).toBeUndefined()
    expect(r.numberSource).toBe('none')
    expect(r.noNumberReason).toBe('chiban')
  })

  it('町字を特定できなければ neighbourhood も出ない', () => {
    const r = toOsmTags(fixture('machiaza-unresolved').result)
    expect(r.tags['addr:neighbourhood']).toBeUndefined()
    expect(r.tags['addr:city']).toBe('横浜市')
    expect(r.tags['addr:suburb']).toBe('旭区')
    expect(r.noNumberReason).toBe('machiaza-unresolved')
  })

  it('小字があれば quarter と neighbourhood を両方出す', () => {
    const r = toOsmTags(fixture('koaza/大字と字の接頭辞').result)
    expect(r.tags['addr:quarter']).toBe('大字藤崎')
    expect(r.tags['addr:neighbourhood']).toBe('字西村井')
    expect(r.noNumberReason).toBe('rsdt-not-implemented')
  })

  it('カナが算用数字なら丁目も算用数字になる', () => {
    const r = toOsmTags(fixture('verified/算用数字告示').result)
    expect(r.tags['addr:neighbourhood']).toBe('西19条南42丁目')
  })
})

describe('toOsmTags extra', () => {
  it('座標と自治体コードと町字IDを入れる', () => {
    const { extra } = toOsmTags(fixture('verified/丁目なし').result)
    expect(extra.point?.lat).toBeCloseTo(35.679, 2)
    expect(extra.point?.level).toBe(8)
    expect(extra.prefectureCode).toBe(130001)
    expect(extra.cityCode).toBe(131016)
    expect(extra.machiazaId).toBe('0056000')
  })

  it('カナとローマ字を入れる', () => {
    const { extra } = toOsmTags(fixture('verified/丁目なし').result)
    expect(extra.kana?.prefecture).toBe('トウキョウト')
    expect(extra.kana?.oazaCho).toBe('キオイチョウ')
    expect(extra.romaji?.city).toBe('Chiyoda-ku')
  })

  it('カナ・ローマ字・コードをタグには入れない', () => {
    const { tags } = toOsmTags(fixture('verified/丁目なし').result)
    const keys = Object.keys(tags)
    expect(keys.every((k) => k.startsWith('addr:') || k === 'note' || k === 'fixme')).toBe(true)
  })
})
