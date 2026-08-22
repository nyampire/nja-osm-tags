import { describe, expect, it } from 'vitest'
import { toOsmTags } from '../src/toOsmTags.ts'
import type { FixtureCase } from '../src/types.ts'
import cases from './fixtures/cases.json' with { type: 'json' }
import chibanCases from './fixtures/chiban-cases.json' with { type: 'json' }

const all = [
  ...(cases as unknown as FixtureCase[]),
  ...(chibanCases as unknown as FixtureCase[]),
]

/**
 * 本設計の最優先要件。
 * 地番方式の住所については、ライセンス上、番地を一切出力しない。
 */
describe('ライセンス境界: 地番方式の番地を出力しない', () => {
  const chiban = all.filter((c) => c.result.metadata.chiban)

  it('地番方式のフィクスチャが十分にある', () => {
    expect(chiban.length).toBeGreaterThanOrEqual(100)
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
})
