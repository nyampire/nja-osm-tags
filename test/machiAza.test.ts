import { describe, expect, it } from 'vitest'
import { machiAzaTags } from '../src/machiAza.ts'
import type { MachiAza } from '../src/types.ts'

const m = (o: Partial<MachiAza>): MachiAza => ({ machiaza_id: '0000000', ...o }) as MachiAza

describe('machiAzaTags', () => {
  it('chome があれば oaza_cho と連結して neighbourhood にする', () => {
    expect(machiAzaTags(m({ oaza_cho: '永田町', oaza_cho_k: 'ナガタチョウ', chome: '一丁目', chome_n: 1 })))
      .toEqual({ neighbourhood: '永田町一丁目' })
  })

  it('koaza があれば oaza_cho を quarter、koaza を neighbourhood にする', () => {
    expect(machiAzaTags(m({ oaza_cho: '大字藤崎', oaza_cho_k: 'オオアザフジサキ', koaza: '字西村井' })))
      .toEqual({ quarter: '大字藤崎', neighbourhood: '字西村井' })
  })

  it('どちらもなければ oaza_cho を neighbourhood にする', () => {
    expect(machiAzaTags(m({ oaza_cho: '二之江町', oaza_cho_k: 'ニノエチョウ' })))
      .toEqual({ neighbourhood: '二之江町' })
  })

  it('「大字」「字」の接頭辞を除去しない', () => {
    expect(machiAzaTags(m({ oaza_cho: '字北畑', oaza_cho_k: 'アザキタハタ' })))
      .toEqual({ neighbourhood: '字北畑' })
    expect(machiAzaTags(m({ oaza_cho: '大字若里', oaza_cho_k: 'オオアザワカサト' })))
      .toEqual({ neighbourhood: '大字若里' })
  })

  it('カナが算用数字なら oaza_cho と chome の両方を算用数字にする', () => {
    expect(machiAzaTags(m({
      oaza_cho: '西十九条南', oaza_cho_k: 'ニシ１９ジョウミナミ', chome: '四十二丁目', chome_n: 42,
    }))).toEqual({ neighbourhood: '西19条南42丁目' })
  })

  it('カナが漢数字なら両方とも漢数字のまま', () => {
    expect(machiAzaTags(m({
      oaza_cho: '丸の内', oaza_cho_k: 'マルノウチ', chome: '二丁目', chome_n: 2,
    }))).toEqual({ neighbourhood: '丸の内二丁目' })
  })

  it('「丁」の表記を保つ', () => {
    expect(machiAzaTags(m({
      oaza_cho: '市之町西', oaza_cho_k: 'イチノチョウニシ', chome: '一丁', chome_n: 1,
    }))).toEqual({ neighbourhood: '市之町西一丁' })
  })

  it('oaza_cho がなく chome だけでも neighbourhood を作る', () => {
    expect(machiAzaTags(m({ chome: '二丁目', chome_n: 2 })))
      .toEqual({ neighbourhood: '二丁目' })
  })

  it('koaza のカナも数字表記の判定に使う', () => {
    expect(machiAzaTags(m({
      oaza_cho: '夏井町夏井', oaza_cho_k: 'ナツイチョウナツイ', koaza: '第三地割', koaza_k: 'ダイ３チワリ',
    }))).toEqual({ quarter: '夏井町夏井', neighbourhood: '第3地割' })
  })

  it('全角数字は常に半角に直す（カナが漢数字読みでも）', () => {
    expect(machiAzaTags(m({
      oaza_cho: '夏井町夏井', oaza_cho_k: 'ナツイチョウナツイ', koaza: '第３地割', koaza_k: 'ダイサンチワリ',
    }))).toEqual({ quarter: '夏井町夏井', neighbourhood: '第3地割' })
    expect(machiAzaTags(m({
      oaza_cho: '旭町', oaza_cho_k: 'アサヒチョウ', koaza: '第１０地割', koaza_k: 'ダイジユツチワリ',
    }))).toEqual({ quarter: '旭町', neighbourhood: '第10地割' })
  })

  it('machiAza が未定義なら空を返す', () => {
    expect(machiAzaTags(undefined)).toEqual({})
  })
})
