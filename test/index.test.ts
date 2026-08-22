import { describe, expect, it } from 'vitest'
import { addressToOsmTags, toOsmTags } from '../src/index.ts'

describe('公開 API', () => {
  it('toOsmTags を再エクスポートしている', () => {
    expect(typeof toOsmTags).toBe('function')
  })

  it('addressToOsmTags は住所文字列からタグを返す', async () => {
    const r = await addressToOsmTags('東京都千代田区紀尾井町1-3')
    expect(r.tags['addr:province']).toBe('東京都')
    expect(r.tags['addr:city']).toBe('千代田区')
    expect(r.tags['addr:neighbourhood']).toBe('紀尾井町')
    expect(r.tags['addr:block_number']).toBe('1')
    expect(r.tags['addr:housenumber']).toBe('3')
    expect(r.numberSource).toBe('verified')
  }, 30_000)

  it('options を渡せる', async () => {
    const r = await addressToOsmTags('東京都千代田区紀尾井町1-3', { country: false })
    expect(r.tags['addr:country']).toBeUndefined()
  }, 30_000)
})
