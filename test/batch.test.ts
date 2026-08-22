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
    const rows = parseCsvText(out)
    const header = rows[0]!
    expect(header).toContain('_lat')
    // 座標列を渡していないので、全行が extra.point で補完される（精度が入る）
    const a = rows[1]!
    expect(a[header.indexOf('_lat')]).not.toBe('')
    expect(a[header.indexOf('_座標精度')]).not.toBe('')
  }, 60_000)

  it('存在しない列名を指定したら落ちる', async () => {
    await expect(
      run({ input: TINY, addressColumn: 'そんな列はない' }),
    ).rejects.toThrow('列が見つかりません: そんな列はない')
    // 座標列の打ち間違いも黙って無視しない
    await expect(
      run({ input: TINY, addressColumn: '所在地', latColumn: '緯度x' }),
    ).rejects.toThrow('列が見つかりません: 緯度x')
  }, 60_000)

  it('解決できない住所でも行と列の対応が保たれる', async () => {
    const bad = new URL('./fixtures/tiny-bad-address.csv', import.meta.url)
    const out = await run({ input: bad, addressColumn: '所在地' })
    const rows = parseCsvText(out)
    const header = rows[0]!
    expect(rows).toHaveLength(3)

    // 1行目は正常に変換される
    expect(rows[1]![header.indexOf('addr:province')]).toBe('東京都')

    // 2行目は NJA が何も解決できないが、行は残り元データも保たれる。
    // NJA は例外を投げず level 0 を返すので、_備考 は machiaza-unresolved のラベルになる
    const badRow = rows[2]!
    expect(badRow).toHaveLength(header.length)
    expect(badRow[header.indexOf('所在地')]).toBe('!!!このような住所は存在しない!!!')
    expect(badRow[header.indexOf('addr:province')]).toBe('')
    expect(badRow[header.indexOf('_番地の根拠')]).toBe('なし')
    expect(badRow[header.indexOf('_備考')]).toBe('町字を特定できず')
  }, 60_000)

  it('ヘッダより長い行は行番号を添えて落ちる', async () => {
    const over = new URL('./fixtures/tiny-overlong.csv', import.meta.url)
    await expect(run({ input: over, addressColumn: '所在地' })).rejects.toThrow(
      /2 行目の列数がヘッダより多いです（ヘッダ 2 列、行 4 列）/,
    )
  }, 60_000)

  it('ヘッダより短い行でも列がずれない', async () => {
    const short = new URL('./fixtures/tiny-ragged.csv', import.meta.url)
    const out = await run({ input: short, addressColumn: '所在地' })
    const rows = parseCsvText(out)
    const header = rows[0]!
    expect(rows[1]).toHaveLength(header.length)
    expect(rows[1]![header.indexOf('addr:province')]).toBe('東京都')
  }, 60_000)
})
