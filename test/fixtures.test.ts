import { describe, expect, it } from 'vitest'
import { fixture, fixtures } from './helpers.ts'

describe('フィクスチャ', () => {
  it('19件ある', () => {
    expect(fixtures).toHaveLength(19)
  })

  it('各件が label / input / result を持つ', () => {
    for (const c of fixtures) {
      expect(c.label).toBeTruthy()
      expect(c.input).toBeTruthy()
      expect(c.result).toHaveProperty('metadata')
    }
  })

  it('分岐を代表するフィクスチャが揃っている', () => {
    expect(fixture('verified/丁目なし').result.metadata.rsdt).toBeTruthy()
    expect(fixture('chiban/郡あり').result.metadata.chiban).toBeTruthy()
    expect(fixture('koaza/大字と字の接頭辞').result.metadata.machiAza?.koaza).toBe('字西村井')
    expect(fixture('machiaza-unresolved').result.metadata.machiAza).toBeUndefined()
  })
})
