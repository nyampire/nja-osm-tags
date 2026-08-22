import { describe, expect, it } from 'vitest'
import { run } from '../bin/batch.ts'
import { parseCsvText } from '../src/csv.ts'

const TINY = new URL('./fixtures/tiny.csv', import.meta.url)

describe('run', () => {
  it('元の列を保ったまま addr:* と備考列を足す', async () => {
    const out = await run({
      input: TINY,
      addressColumn: '所在地',
      latColumn: '緯度',
      lngColumn: '経度',
    })
    const rows = parseCsvText(out)
    const header = rows[0]!
    expect(header.slice(0, 5)).toEqual(['ID', '名称', '所在地', '緯度', '経度'])
    expect(header).toContain('addr:neighbourhood')
    expect(header).toContain('_番地の根拠')
    expect(header).toContain('_備考')

    const col = (row: string[], name: string) => row[header.indexOf(name)]

    const a = rows[1]!
    expect(col(a, 'addr:city')).toBe('千代田区')
    expect(col(a, 'addr:block_number')).toBe('1')
    expect(col(a, '_番地の根拠')).toBe('照合済み')
    expect(col(a, '_lat')).toBe('35.679')
    expect(col(a, '_座標精度')).toBe('')

    const b = rows[2]!
    expect(col(b, 'addr:county')).toBe('東牟婁郡')
    expect(col(b, 'addr:block_number')).toBe('')
    expect(col(b, '_備考')).toBe('地番方式のため対象外')
    // 元の座標が 0.0 なので NJA の代表点で補完される
    expect(col(b, '_lat')).not.toBe('')
    expect(col(b, '_座標精度')).not.toBe('')

    const c = rows[3]!
    expect(col(c, '名称')).toBe('C, 薬局')
    expect(col(c, 'addr:block_number')).toBe('10')
    expect(col(c, 'addr:housenumber')).toBe('28')
    expect(col(c, '_番地の根拠')).toBe('推定')
    expect(col(c, 'note')).toBe('はりまビル')
  }, 60_000)

  it('座標列を指定しなくても動く', async () => {
    const out = await run({ input: TINY, addressColumn: '所在地' })
    expect(out.split('\n')[0]).toContain('_lat')
  }, 60_000)
})
