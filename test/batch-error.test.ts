/**
 * バッチ CLI の行単位エラー処理のテスト。
 *
 * `run()` の責務は「協調相手が例外を投げたときに追加列を空にして理由を
 * `_備考` に書き、残りの行を処理し続ける」こと。したがって協調相手である
 * `addressToOsmTags` を差し替えて投げさせるのが正しい検証になる。
 *
 * NJA 自体は解決できない住所でも例外を投げず `level 0` を返すため、
 * 実際の入力で決定的に例外を起こすことはできない。
 *
 * 正常系の住所も差し替えた値を返すので、このファイルはネットワークを使わない。
 * `vi.mock` は同一ファイル内の全テストに効くため、実物を使う
 * `test/batch.test.ts` とは分けている。
 */
import { describe, expect, it, vi } from 'vitest'
import { run } from '../bin/batch.ts'
import { parseCsvText } from '../src/csv.ts'
import type { ConversionResult } from '../src/types.ts'

/** 差し替えが返す固定値。実際の紀尾井町1-3の変換結果に相当する */
const CANNED: ConversionResult = {
  tags: {
    'addr:country': 'JP',
    'addr:province': '東京都',
    'addr:city': '千代田区',
    'addr:neighbourhood': '紀尾井町',
    'addr:block_number': '1',
    'addr:housenumber': '3',
  },
  numberSource: 'verified',
  extra: { point: { lat: 35.679107172, lng: 139.736394597, level: 8 } },
}

vi.mock('../src/index.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/index.ts')>()
  return {
    ...actual,
    addressToOsmTags: async (input: string) => {
      if (input.includes('FAIL')) throw new Error('注入した失敗')
      if (input.includes('THROW_STRING')) throw '文字列を投げた'
      return CANNED
    },
  }
})

const ERROR_CSV = new URL('./fixtures/tiny-error.csv', import.meta.url)

describe('run の行単位エラー処理', () => {
  it('失敗した行も残し、理由を _備考 に書く', async () => {
    const rows = parseCsvText(await run({ input: ERROR_CSV, addressColumn: '所在地' }))
    const header = rows[0]!
    const col = (r: string[], k: string) => r[header.indexOf(k)]

    expect(rows).toHaveLength(4)

    const failed = rows[2]!
    expect(col(failed, '所在地')).toBe('FAILトリガー')
    expect(col(failed, '_備考')).toBe('変換に失敗: 注入した失敗')
  })

  it('失敗した行の追加列は _備考 以外すべて空', async () => {
    const rows = parseCsvText(await run({ input: ERROR_CSV, addressColumn: '所在地' }))
    const header = rows[0]!
    const failed = rows[2]!

    for (const k of ['addr:country', 'addr:province', 'addr:city', 'addr:neighbourhood',
                     'addr:block_number', 'addr:housenumber', 'note', 'fixme',
                     '_番地の根拠', '_lat', '_lng', '_座標精度']) {
      expect(failed[header.indexOf(k)], `${k} は空であるべき`).toBe('')
    }
  })

  it('失敗の後の行も処理を続ける', async () => {
    const rows = parseCsvText(await run({ input: ERROR_CSV, addressColumn: '所在地' }))
    const header = rows[0]!
    const col = (r: string[], k: string) => r[header.indexOf(k)]

    // 1行目（失敗前）と3行目（失敗後）がどちらも変換されている
    expect(col(rows[1]!, 'addr:province')).toBe('東京都')
    expect(col(rows[1]!, '_番地の根拠')).toBe('照合済み')
    expect(col(rows[3]!, 'addr:province')).toBe('東京都')
    expect(col(rows[3]!, '_番地の根拠')).toBe('照合済み')
  })

  it('失敗しても行と列の対応が崩れない', async () => {
    const rows = parseCsvText(await run({ input: ERROR_CSV, addressColumn: '所在地' }))
    const widths = new Set(rows.map((r) => r.length))
    expect(widths.size, `列数が揃っていない: ${[...widths]}`).toBe(1)
  })

  it('geojson でも失敗した行を残し、geometry を null にする', async () => {
    const fc = JSON.parse(
      await run({ format: 'geojson', input: ERROR_CSV, addressColumn: '所在地' }),
    )
    expect(fc.features).toHaveLength(3)

    const failed = fc.features[1]
    expect(failed.geometry).toBeNull()
    expect(failed.properties['_備考']).toBe('変換に失敗: 注入した失敗')
    // 元の列は残す
    expect(failed.properties['所在地']).toBe('FAILトリガー')
    // 変換できていないので addr:* は入らない
    expect(failed.properties['addr:province']).toBeUndefined()

    // 失敗の前後は変換されている
    expect(fc.features[0].properties['addr:province']).toBe('東京都')
    expect(fc.features[2].properties['addr:province']).toBe('東京都')
  })

  it('Error 以外が投げられても文字列化して続ける', async () => {
    const rows = parseCsvText(
      await run({ input: new URL('./fixtures/tiny-throw.csv', import.meta.url), addressColumn: '所在地' }),
    )
    const header = rows[0]!
    expect(rows[1]![header.indexOf('_備考')]).toBe('変換に失敗: 文字列を投げた')
  })
})
