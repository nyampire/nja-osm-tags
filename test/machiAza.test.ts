import { describe, expect, it } from 'vitest'
import { hasMachiAzaName, machiAzaTags } from '../src/machiAza.ts'
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

  // 丁目のあとに方角が付く町名は、chome フィールドに入らないため ABR が
  // koaza に入れる（南郷通十四丁目南 -> oaza_cho=南郷通 + koaza=十四丁目南）。
  // 意味は丁目なので分割しない
  it('koaza が丁目の続きなら分割せず連結する', () => {
    expect(machiAzaTags(m({
      oaza_cho: '南郷通', oaza_cho_k: 'ナンゴウドオリ', koaza: '十四丁目南', koaza_k: '１４チョウメ',
    }))).toEqual({ neighbourhood: '南郷通14丁目南' })

    expect(machiAzaTags(m({
      oaza_cho: '平和通', oaza_cho_k: 'ヘイワドオリ', koaza: '一丁目北', koaza_k: '１チョウメ',
    }))).toEqual({ neighbourhood: '平和通1丁目北' })
  })

  it('1フィールドで来ても同じ出力になる', () => {
    const split = machiAzaTags(m({
      oaza_cho: '南郷通', oaza_cho_k: 'ナンゴウドオリ', koaza: '十四丁目南', koaza_k: '１４チョウメ',
    }))
    const whole = machiAzaTags(m({
      oaza_cho: '南郷通14丁目南', oaza_cho_k: 'ナンゴウドオリ１４チョウメミナミ',
    }))
    expect(split).toEqual(whole)
  })

  it('丁目形でない koaza は連結せず分割したまま', () => {
    // 「方八丁」は地名。先頭が数字ではないので丁目の続きではない
    expect(machiAzaTags(m({
      oaza_cho: '安積町荒井', oaza_cho_k: 'アサカマチアライ', koaza: '字方八丁', koaza_k: 'アザホウハッチョウ',
    }))).toEqual({ quarter: '安積町荒井', neighbourhood: '字方八丁' })

    // 郡山市の小字。丁目を含むが先頭が数字ではない
    expect(machiAzaTags(m({
      oaza_cho: '日和田町八丁目', oaza_cho_k: 'ヒワダマチハッチョウメ', koaza: '字堰山', koaza_k: 'アザセキヤマ',
    }))).toEqual({ quarter: '日和田町八丁目', neighbourhood: '字堰山' })
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

  it('oaza_cho がなく koaza だけなら quarter は出さない', () => {
    expect(machiAzaTags(m({ koaza: '千国', koaza_k: 'チクニ' })))
      .toEqual({ neighbourhood: '千国' })
  })

  it('machiAza が未定義なら空を返す', () => {
    expect(machiAzaTags(undefined)).toEqual({})
  })

  it('町字名を1つも持たないプレースホルダなら空を返す', () => {
    expect(machiAzaTags(m({}))).toEqual({})
  })
})

describe('hasMachiAzaName', () => {
  it('未定義なら false', () => {
    expect(hasMachiAzaName(undefined)).toBe(false)
  })

  it('machiaza_id だけのプレースホルダなら false', () => {
    expect(hasMachiAzaName(m({}))).toBe(false)
  })

  it('oaza_cho / chome / koaza のいずれかがあれば true', () => {
    expect(hasMachiAzaName(m({ oaza_cho: '永田町' }))).toBe(true)
    expect(hasMachiAzaName(m({ chome: '一丁目' }))).toBe(true)
    expect(hasMachiAzaName(m({ koaza: '字北畑' }))).toBe(true)
  })
})
