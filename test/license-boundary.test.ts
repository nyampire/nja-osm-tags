import { describe, expect, it } from 'vitest'
import { isPointEmittable } from '../src/point.ts'
import { toOsmTags } from '../src/toOsmTags.ts'
import type { FixtureCase } from '../src/types.ts'
import { chibanFixtures, fixtures } from './helpers.ts'

/**
 * 実データ由来のフィクスチャはすべて `machiAza.rsdt` を持たないため、
 * `chiban` ガードを消しても `rsdt-not-implemented` で捕まってしまい、
 * 番地タグ不在のアサーションが空振りする。
 *
 * そこで「ガードが無ければ確実に番地を出す」形の合成ケースを1件加える。
 * これが番地タグ不在のアサーションに実効性を与える唯一のケースなので、
 * 削除しないこと。
 */
const GUARD_PROBE: FixtureCase = {
  label: 'synthetic/chiban+rsdt実施済み+数字で始まる残余',
  input: '（合成）ガード検証用',
  result: {
    other: '3-12',
    level: 3,
    metadata: {
      input: '（合成）ガード検証用',
      prefecture: { code: 270008, pref: '大阪府', pref_k: 'オオサカフ', pref_r: 'Osaka', point: [135.52, 34.686] },
      city: { code: 272019, city: '堺市', city_k: 'サカイシ', city_r: 'Sakai-shi', ward: '北区', ward_k: 'キタク', ward_r: 'Kita-ku', point: [135.5, 34.57] },
      machiAza: { machiaza_id: '0001000', oaza_cho: '東浅香山町', oaza_cho_k: 'ヒガシアサカヤマチョウ', rsdt: true },
      chiban: { prc_num1: '0', prc_num2: '0', prc_num3: '0' },
    },
  } as unknown as FixtureCase['result'],
}

const all = [
  ...fixtures,
  ...chibanFixtures,
  GUARD_PROBE,
]

/**
 * 本設計の最優先要件。
 * 地番方式の住所については、ライセンス上、番地を一切出力しない。
 */
describe('ライセンス境界: 地番方式の番地を出力しない', () => {
  const chiban = all.filter((c) => c.result.metadata.chiban)

  it('実データ由来の地番フィクスチャが100件ある', () => {
    expect(chibanFixtures.length).toBe(100)
  })

  it('ガード検証用の合成ケースが、ガードが無ければ番地を出す形になっている', () => {
    // このケースは chiban / machiAza.rsdt===true / 数字で始まる残余 の3つを同時に満たす。
    // ガードを消すと inferred 分岐に落ちて block_number=3, housenumber=12 を出す。
    const m = GUARD_PROBE.result.metadata
    expect(m.chiban).toBeTruthy()
    expect(m.machiAza?.rsdt).toBe(true)
    expect(m.rsdt).toBeUndefined()
    expect(/^\d/.test(GUARD_PROBE.result.other)).toBe(true)
  })

  it.each(chiban.map((c) => [c.label, c] as const))(
    '%s は block_number と housenumber を出さない',
    (_label, c) => {
      const { tags, numberSource, noNumberReason } = toOsmTags(c.result)
      expect(tags['addr:block_number']).toBeUndefined()
      expect(tags['addr:housenumber']).toBeUndefined()
      expect(numberSource).toBe('none')
      expect(noNumberReason).toBe('chiban')
    },
  )

  it('note / fixme を抑止しても番地は出ない', () => {
    for (const c of chiban) {
      const { tags } = toOsmTags(c.result, { note: false, fixme: false })
      expect(tags['addr:block_number']).toBeUndefined()
      expect(tags['addr:housenumber']).toBeUndefined()
    }
  })

  it('地番方式でも町字までの階層は出力する', () => {
    const withMachiAza = chiban.filter((c) => c.result.metadata.machiAza)
    expect(withMachiAza.length).toBeGreaterThan(0)
    for (const c of withMachiAza) {
      const { tags } = toOsmTags(c.result)
      expect(tags['addr:province']).toBeTruthy()
      expect(tags['addr:neighbourhood'] ?? tags['addr:quarter']).toBeTruthy()
    }
  })

  it('地番由来の座標を出力しない', () => {
    for (const c of chiban) {
      const { extra } = toOsmTags(c.result)
      // rsdt に裏付けられていない level 8 は地番由来なので出さない
      if (extra.point) expect(extra.point.level).not.toBe(8)
    }
  })

  // フィクスチャ自体のマスクを固定する。
  // これがないと生成スクリプトから maskChiban が抜けても
  // スイートが緑のまま地番100件と筆座標84件がリポジトリに入る。
  it('chiban-cases.json の地番と座標がマスクされている', () => {
    const generated = chibanFixtures
    for (const c of generated) {
      expect(c.result.metadata.chiban).toEqual({
        prc_num1: '0',
        prc_num2: '0',
        prc_num3: '0',
      })
      if (c.result.point && !isPointEmittable(c.result.point, c.result.metadata)) {
        expect(c.result.point).toEqual({ lat: 0, lng: 0, level: c.result.point.level })
      }
    }
  })
})
