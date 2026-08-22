import { describe, expect, it } from 'vitest'
import { decideNumbers, parseNumberElements } from '../src/numbers.ts'
import type { NormalizeResult } from '@geolonia/normalize-japanese-addresses'

describe('parseNumberElements', () => {
  it('先頭の数字ハイフン列を要素に分割し、残りを rest に入れる', () => {
    expect(parseNumberElements('10-28 はりまビル')).toEqual({ elements: ['10', '28'], rest: 'はりまビル' })
    expect(parseNumberElements('1-8-102')).toEqual({ elements: ['1', '8', '102'], rest: '' })
    expect(parseNumberElements('3-2エスタシオB')).toEqual({ elements: ['3', '2'], rest: 'エスタシオB' })
    expect(parseNumberElements('29')).toEqual({ elements: ['29'], rest: '' })
  })

  it('数字で始まらなければ要素は空', () => {
    expect(parseNumberElements('乙無番地')).toEqual({ elements: [], rest: '乙無番地' })
  })

  it('空文字列なら要素も rest も空', () => {
    expect(parseNumberElements('')).toEqual({ elements: [], rest: '' })
  })

  it('末尾に余ったハイフンは rest に残さない', () => {
    expect(parseNumberElements('5-')).toEqual({ elements: ['5'], rest: '' })
    expect(parseNumberElements('5- はりまビル')).toEqual({ elements: ['5'], rest: 'はりまビル' })
  })

  it('先頭がハイフンなら要素は空', () => {
    expect(parseNumberElements('-5')).toEqual({ elements: [], rest: '-5' })
  })

  it('要素の 0 を落とさない', () => {
    expect(parseNumberElements('0-1')).toEqual({ elements: ['0', '1'], rest: '' })
  })
})

/** テスト用の最小 NormalizeResult を作る */
function res(o: {
  other?: string
  rsdt?: { blk_num?: string; rsdt_num: string; rsdt_num2?: string }
  chiban?: { prc_num1: string }
  machiAza?: { rsdt?: true } | undefined
  hasMachiAza?: boolean
}): NormalizeResult {
  const machiAza =
    o.hasMachiAza === false
      ? undefined
      : { machiaza_id: '0000000', ...(o.machiAza ?? {}) }
  return {
    other: o.other ?? '',
    level: 3,
    metadata: {
      input: '',
      machiAza,
      rsdt: o.rsdt,
      chiban: o.chiban,
    },
  } as unknown as NormalizeResult
}

describe('decideNumbers', () => {
  it('chiban があれば番地を出さない（ライセンス要件）', () => {
    const d = decideNumbers(res({ chiban: { prc_num1: '1800' }, other: '', machiAza: {} }))
    expect(d.blockNumber).toBeUndefined()
    expect(d.housenumber).toBeUndefined()
    expect(d.numberSource).toBe('none')
    expect(d.noNumberReason).toBe('chiban')
  })

  it('chiban と rsdt フラグなしが同時なら chiban を優先する', () => {
    const d = decideNumbers(res({ chiban: { prc_num1: '12' }, other: '', machiAza: {} }))
    expect(d.noNumberReason).toBe('chiban')
  })

  // ガードの「位置」が要件を担保しているので、下流の全行に対して固定する。
  // これがないと `if (chiban && machiAza?.rsdt !== true)` のような一行の編集で
  // 地番が block_number に漏れ、しかもテストは全部通ってしまう。
  it('chiban と rsdt 明細が同時でも chiban を優先し番地を出さない', () => {
    const d = decideNumbers(res({
      chiban: { prc_num1: '1800' },
      rsdt: { blk_num: '1', rsdt_num: '3' },
      machiAza: { rsdt: true },
    }))
    expect(d.blockNumber).toBeUndefined()
    expect(d.housenumber).toBeUndefined()
    expect(d.numberSource).toBe('none')
    expect(d.noNumberReason).toBe('chiban')
  })

  it('chiban と 住居表示実施済み+数字で始まる残余が同時でも番地を出さない', () => {
    const d = decideNumbers(res({
      chiban: { prc_num1: '1800' },
      machiAza: { rsdt: true },
      other: '1800-1',
    }))
    expect(d.blockNumber).toBeUndefined()
    expect(d.housenumber).toBeUndefined()
    expect(d.numberSource).toBe('none')
    expect(d.noNumberReason).toBe('chiban')
  })

  it('rsdt 明細があれば verified で blk_num / rsdt_num を使う', () => {
    const d = decideNumbers(res({ rsdt: { blk_num: '1', rsdt_num: '3' }, machiAza: { rsdt: true } }))
    expect(d).toMatchObject({ blockNumber: '1', housenumber: '3', numberSource: 'verified' })
    expect(d.noNumberReason).toBeUndefined()
  })

  it('支号があれば housenumber に - で連結する', () => {
    const d = decideNumbers(res({ rsdt: { blk_num: '5', rsdt_num: '8', rsdt_num2: '2' }, machiAza: { rsdt: true } }))
    expect(d.housenumber).toBe('8-2')
  })

  it('支号が空文字列なら連結しない', () => {
    const d = decideNumbers(res({ rsdt: { blk_num: '5', rsdt_num: '8', rsdt_num2: '' }, machiAza: { rsdt: true } }))
    expect(d.housenumber).toBe('8')
  })

  it('machiAza を特定できなければ machiaza-unresolved', () => {
    const d = decideNumbers(res({ hasMachiAza: false, other: '二俣川' }))
    expect(d.numberSource).toBe('none')
    expect(d.noNumberReason).toBe('machiaza-unresolved')
    expect(d.residue).toBe('二俣川')
  })

  it('住居表示未実施なら rsdt-not-implemented', () => {
    const d = decideNumbers(res({ machiAza: {}, other: '1800' }))
    expect(d.numberSource).toBe('none')
    expect(d.noNumberReason).toBe('rsdt-not-implemented')
    expect(d.residue).toBe('1800')
  })

  it('住居表示実施済みで残余が2要素なら inferred', () => {
    const d = decideNumbers(res({ machiAza: { rsdt: true }, other: '10-28 はりまビル' }))
    expect(d).toMatchObject({ blockNumber: '10', housenumber: '28', numberSource: 'inferred', residue: 'はりまビル' })
    expect(d.extraElements).toBeUndefined()
  })

  it('残余が3要素なら先頭2つを番地にし、3つ目以降を extraElements と residue に残す', () => {
    const d = decideNumbers(res({ machiAza: { rsdt: true }, other: '1-8-102' }))
    expect(d).toMatchObject({ blockNumber: '1', housenumber: '8', numberSource: 'inferred', extraElements: '102', residue: '102' })
  })

  it('残余が4要素なら3つ目以降を - で連結する', () => {
    const d = decideNumbers(res({ machiAza: { rsdt: true }, other: '1-2-3-4' }))
    expect(d.extraElements).toBe('3-4')
    expect(d.residue).toBe('3-4')
  })

  it('3要素目以降と建物名が両方あれば residue に両方入る', () => {
    const d = decideNumbers(res({ machiAza: { rsdt: true }, other: '1-8-102 メゾンK' }))
    expect(d.extraElements).toBe('102')
    expect(d.residue).toBe('102 メゾンK')
  })

  it('残余が1要素なら block_number のみ', () => {
    const d = decideNumbers(res({ machiAza: { rsdt: true }, other: '29' }))
    expect(d).toMatchObject({ blockNumber: '29', numberSource: 'inferred' })
    expect(d.housenumber).toBeUndefined()
  })

  it('住居表示実施済みでも残余が数字で始まらなければ rsdt-detail-missing', () => {
    const d = decideNumbers(res({ machiAza: { rsdt: true }, other: '乙無番地' }))
    expect(d.numberSource).toBe('none')
    expect(d.noNumberReason).toBe('rsdt-detail-missing')
    expect(d.residue).toBe('乙無番地')
  })

  it('街区符号を持たない住居表示は housenumber だけ出す', () => {
    const d = decideNumbers(res({ rsdt: { rsdt_num: '3' }, machiAza: { rsdt: true } }))
    expect(d.blockNumber).toBeUndefined()
    expect(d.housenumber).toBe('3')
    expect(d.numberSource).toBe('verified')
  })

  it('住居番号が空文字列なら housenumber を出さない', () => {
    const d = decideNumbers(res({ rsdt: { blk_num: '5', rsdt_num: '' }, machiAza: { rsdt: true } }))
    expect(d.blockNumber).toBe('5')
    expect(d.housenumber).toBeUndefined()
    expect(d.numberSource).toBe('verified')
  })

  it('残余の前後の空白を除く', () => {
    const d = decideNumbers(res({ rsdt: { blk_num: '1', rsdt_num: '3' }, machiAza: { rsdt: true }, other: '  東京ガーデンテラス 5F  ' }))
    expect(d.residue).toBe('東京ガーデンテラス 5F')
  })
})
