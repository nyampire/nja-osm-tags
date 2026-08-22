import { describe, expect, it } from 'vitest'
import { buildNotes } from '../src/notes.ts'

describe('buildNotes', () => {
  it('残余があれば note に入れる', () => {
    expect(buildNotes('はりまビル', undefined, {})).toEqual({ note: 'はりまビル' })
  })

  it('残余が空なら note を出さない', () => {
    expect(buildNotes('', undefined, {})).toEqual({})
  })

  it('3要素目以降があれば fixme を出す', () => {
    expect(buildNotes('102', '102', {})).toEqual({
      note: '102',
      fixme: '番地の3要素目以降を確認: 102',
    })
  })

  it('3要素目以降と建物名が両方あるとき', () => {
    expect(buildNotes('102 メゾンK', '102', {})).toEqual({
      note: '102 メゾンK',
      fixme: '番地の3要素目以降を確認: 102',
    })
  })

  it('options.note が false なら note を抑止する', () => {
    expect(buildNotes('はりまビル', undefined, { note: false })).toEqual({})
  })

  it('options.fixme が false なら fixme を抑止する', () => {
    expect(buildNotes('102', '102', { fixme: false })).toEqual({ note: '102' })
  })

  it('両方 false なら空を返す', () => {
    expect(buildNotes('102', '102', { note: false, fixme: false })).toEqual({})
  })
})
