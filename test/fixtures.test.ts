import { describe, expect, it } from 'vitest'
import { fixture, fixtures } from './helpers.ts'

describe('フィクスチャ', () => {
  it('20件ある', () => {
    expect(fixtures).toHaveLength(20)
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

  // この2件は取り違えやすいので、分岐の決め手になる条件を直接固定する
  it('rsdt-not-implemented/無番地 は machiAza.rsdt を持たない', () => {
    const c = fixture('rsdt-not-implemented/無番地')
    expect(c.result.metadata.machiAza).toBeDefined()
    expect(c.result.metadata.machiAza?.rsdt).toBeUndefined()
    expect(c.result.metadata.rsdt).toBeUndefined()
    expect(c.result.metadata.chiban).toBeUndefined()
    expect(c.result.other).toBe('乙無番地')
  })

  it('rsdt-detail-missing/数字で始まらない は machiAza.rsdt が true で残余が数字で始まらない', () => {
    const c = fixture('rsdt-detail-missing/数字で始まらない')
    expect(c.result.metadata.machiAza?.rsdt).toBe(true)
    expect(c.result.metadata.rsdt).toBeUndefined()
    expect(c.result.metadata.chiban).toBeUndefined()
    expect(c.result.other).toBe('別所新町2-14-201')
    expect(/^\d/.test(c.result.other)).toBe(false)
  })
})
