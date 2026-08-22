import { describe, expect, it } from 'vitest'
import { normalize, version } from '@geolonia/normalize-japanese-addresses'

// NJA は住所データを外部 API から取得するため、このテストはネットワークを使う。
describe('NJA の動作環境', () => {
  it('パッケージが読み込める', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('住居表示住所を level 8 まで正規化できる', async () => {
    const r = await normalize('東京都千代田区紀尾井町1-3')
    expect(r.level).toBe(8)
    expect(r.pref).toBe('東京都')
    expect(r.city).toBe('千代田区')
    expect(r.town).toBe('紀尾井町')
    expect(r.metadata.rsdt).toEqual(
      expect.objectContaining({ blk_num: '1', rsdt_num: '3' }),
    )
  }, 30_000)

  it('地番住所の地番を metadata.chiban から取れる', async () => {
    const r = await normalize('和歌山県東牟婁郡串本町串本1800')
    expect(r.metadata.city?.county).toBe('東牟婁郡')
    expect(r.metadata.chiban?.prc_num1).toBe('1800')
  }, 30_000)
})
