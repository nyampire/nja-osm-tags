import { describe, expect, it } from 'vitest'
import { formatCsv, parseCsv, parseCsvText } from '../src/csv.ts'

const TINY = new URL('./fixtures/tiny.csv', import.meta.url)

describe('parseCsvText', () => {
  it('引用符内の改行を値として保つ', () => {
    expect(parseCsvText('a,"b\nc",d\n')).toEqual([['a', 'b\nc', 'd']])
  })

  it('二重引用符のエスケープを解く', () => {
    expect(parseCsvText('"a""b"\n')).toEqual([['a"b']])
  })

  it('末尾に改行がなくても最後の行を返す', () => {
    expect(parseCsvText('a,b')).toEqual([['a', 'b']])
  })

  it('formatCsv の出力を読み戻せる', () => {
    const rows = [['a', 'b,c', 'd"e', 'f\ng'], ['1', '2', '3', '4']]
    expect(parseCsvText(formatCsv(rows))).toEqual(rows)
  })
})

describe('parseCsv', () => {
  it('BOM を除去する', async () => {
    const rows = await parseCsv(TINY)
    expect(rows[0]?.[0]).toBe('ID')
  })

  it('引用符内のカンマを値として保つ', async () => {
    const rows = await parseCsv(TINY)
    expect(rows[3]?.[1]).toBe('C, 薬局')
  })

  it('全行を読む', async () => {
    expect(await parseCsv(TINY)).toHaveLength(4)
  })

  it('ヘッダを正しく読む', async () => {
    const rows = await parseCsv(TINY)
    expect(rows[0]).toEqual(['ID', '名称', '所在地', '緯度', '経度'])
  })
})

describe('formatCsv', () => {
  it('カンマ・引用符・改行を含む値を引用符で囲む', () => {
    expect(formatCsv([['a', 'b,c', 'd"e', 'f\ng']])).toBe('a,"b,c","d""e","f\ng"\n')
  })

  it('普通の値は囲まない', () => {
    expect(formatCsv([['a', 'b']])).toBe('a,b\n')
  })

  it('複数行を改行で連結する', () => {
    expect(formatCsv([['a'], ['b']])).toBe('a\nb\n')
  })
})
