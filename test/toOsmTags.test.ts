import { describe, expect, it } from 'vitest'
import { toOsmTags } from '../src/toOsmTags.ts'
import type { FixtureCase } from '../src/types.ts'
import { fixture } from './helpers.ts'
import sheetCases from './fixtures/sheet-cases.json' with { type: 'json' }

describe('toOsmTags 階層タグ', () => {
  it('特別区', () => {
    const { tags } = toOsmTags(fixture('verified/丁目なし').result)
    expect(tags['addr:country']).toBe('JP')
    expect(tags['addr:province']).toBe('東京都')
    expect(tags['addr:city']).toBe('千代田区')
    expect(tags['addr:suburb']).toBeUndefined()
    expect(tags['addr:county']).toBeUndefined()
  })

  it('政令指定都市は city と suburb に分ける', () => {
    const { tags } = toOsmTags(fixture('verified/政令市の区+丁目').result)
    expect(tags['addr:city']).toBe('大阪市')
    expect(tags['addr:suburb']).toBe('浪速区')
  })

  it('郡は county に入れ、city には町村名だけを入れる', () => {
    const { tags } = toOsmTags(fixture('chiban/郡あり').result)
    expect(tags['addr:county']).toBe('東牟婁郡')
    expect(tags['addr:city']).toBe('串本町')
  })

  it('options.country が false なら addr:country を出さない', () => {
    const { tags } = toOsmTags(fixture('verified/丁目なし').result, { country: false })
    expect(tags['addr:country']).toBeUndefined()
  })
})

describe('toOsmTags 番地と注記', () => {
  it('verified', () => {
    const r = toOsmTags(fixture('verified/丁目なし').result)
    expect(r.tags['addr:neighbourhood']).toBe('紀尾井町')
    expect(r.tags['addr:block_number']).toBe('1')
    expect(r.tags['addr:housenumber']).toBe('3')
    expect(r.numberSource).toBe('verified')
    expect(r.noNumberReason).toBeUndefined()
    expect(r.tags.note).toBeUndefined()
  })

  it('verified + 残余は note に入る', () => {
    const r = toOsmTags(fixture('verified/残余あり').result)
    expect(r.numberSource).toBe('verified')
    expect(r.tags.note).toContain('東京ガーデンテラス')
    expect(r.tags.fixme).toBeUndefined()
  })

  it('inferred 2要素', () => {
    const r = toOsmTags(fixture('inferred/2要素+残余').result)
    expect(r.tags['addr:block_number']).toBe('10')
    expect(r.tags['addr:housenumber']).toBe('28')
    expect(r.numberSource).toBe('inferred')
    expect(r.tags.note).toBe('はりまビル')
    expect(r.tags.fixme).toBeUndefined()
  })

  it('inferred 3要素は fixme を出す', () => {
    const r = toOsmTags(fixture('inferred/3要素').result)
    expect(r.tags['addr:block_number']).toBe('1')
    expect(r.tags['addr:housenumber']).toBe('8')
    expect(r.numberSource).toBe('inferred')
    expect(r.tags.fixme).toBe('番地の3要素目以降を確認: 102')
  })

  it('options が buildNotes に届いている', () => {
    const r = toOsmTags(fixture('inferred/3要素').result, { note: false, fixme: false })
    expect(r.tags.note).toBeUndefined()
    expect(r.tags.fixme).toBeUndefined()
    // 番地は抑止されない
    expect(r.tags['addr:block_number']).toBe('1')
  })

  it('地番方式は番地タグを出さない', () => {
    const r = toOsmTags(fixture('chiban/郡あり').result)
    expect(r.tags['addr:block_number']).toBeUndefined()
    expect(r.tags['addr:housenumber']).toBeUndefined()
    expect(r.numberSource).toBe('none')
    expect(r.noNumberReason).toBe('chiban')
  })

  it('町字を特定できなければ neighbourhood も出ない', () => {
    const r = toOsmTags(fixture('machiaza-unresolved').result)
    expect(r.tags['addr:neighbourhood']).toBeUndefined()
    expect(r.tags['addr:city']).toBe('横浜市')
    expect(r.tags['addr:suburb']).toBe('旭区')
    expect(r.noNumberReason).toBe('machiaza-unresolved')
  })

  it('小字があれば quarter と neighbourhood を両方出す', () => {
    const r = toOsmTags(fixture('koaza/大字と字の接頭辞').result)
    expect(r.tags['addr:quarter']).toBe('大字藤崎')
    expect(r.tags['addr:neighbourhood']).toBe('字西村井')
    expect(r.noNumberReason).toBe('rsdt-not-implemented')
  })

  it('カナが算用数字なら丁目も算用数字になる', () => {
    const r = toOsmTags(fixture('verified/算用数字告示').result)
    expect(r.tags['addr:neighbourhood']).toBe('西19条南42丁目')
  })
})

describe('toOsmTags extra', () => {
  it('座標と自治体コードと町字IDを入れる', () => {
    const { extra } = toOsmTags(fixture('verified/丁目なし').result)
    expect(extra.point?.lat).toBeCloseTo(35.679, 2)
    expect(extra.point?.level).toBe(8)
    expect(extra.prefectureCode).toBe(130001)
    expect(extra.cityCode).toBe(131016)
    expect(extra.machiazaId).toBe('0056000')
  })

  it('カナとローマ字を入れる', () => {
    const { extra } = toOsmTags(fixture('verified/丁目なし').result)
    expect(extra.kana?.prefecture).toBe('トウキョウト')
    expect(extra.kana?.oazaCho).toBe('キオイチョウ')
    expect(extra.romaji?.city).toBe('Chiyoda-ku')
  })

  it('地番方式の住所では座標を出さない', () => {
    const { extra } = toOsmTags(fixture('chiban/郡あり').result)
    // このフィクスチャは level 3（町字代表点）なので出る
    expect(extra.point?.level).toBe(3)
  })

  it('rsdt に裏付けられていない level 8 の座標は出さない', () => {
    const base = fixture('chiban/郡あり').result
    const forged = {
      ...base,
      point: { lat: 1, lng: 2, level: 8 },
      metadata: { ...base.metadata, rsdt: undefined },
    }
    expect(toOsmTags(forged).extra.point).toBeUndefined()
  })

  it('rsdt がある level 8 の座標は出す', () => {
    const { extra } = toOsmTags(fixture('verified/丁目なし').result)
    expect(extra.point?.level).toBe(8)
  })

  // 番地の決定表は chiban を rsdt より優先する。座標も同じ優先順位にする。
  // ここが揃っていないと、番地は落ちるのに座標だけ通る穴ができる。
  it('chiban と rsdt が同時なら level 8 の座標を出さない', () => {
    const base = fixture('verified/丁目なし').result
    const forged = {
      ...base,
      point: { lat: 34.1234, lng: 135.5678, level: 8 },
      metadata: {
        ...base.metadata,
        chiban: { prc_num1: '0', prc_num2: '0', prc_num3: '0' },
      },
    }
    const r = toOsmTags(forged)
    expect(r.extra.point).toBeUndefined()
    // 番地側も落ちていることを併せて確認する
    expect(r.tags['addr:block_number']).toBeUndefined()
    expect(r.tags['addr:housenumber']).toBeUndefined()
    expect(r.noNumberReason).toBe('chiban')
  })

  it('町字名を持たないプレースホルダの町字IDは出さない', () => {
    // cases.json には該当フィクスチャがないため sheet-cases.json から拾う。
    // NJA が市区町村までしか特定できなかったとき machiAza に
    // { machiaza_id: '0000000' } というプレースホルダを返すケース。
    const c = (sheetCases as unknown as FixtureCase[]).find(
      (c) => c.label === '茨城県龍ケ崎市寺後',
    )
    if (!c) throw new Error('フィクスチャが見つかりません: 茨城県龍ケ崎市寺後')
    const { extra } = toOsmTags(c.result)
    expect(extra.machiazaId).toBeUndefined()
  })

  it('カナ・ローマ字・コードをタグには入れない', () => {
    const { tags } = toOsmTags(fixture('verified/丁目なし').result)
    const keys = Object.keys(tags)
    expect(keys.every((k) => k.startsWith('addr:') || k === 'note' || k === 'fixme')).toBe(true)
  })
})

/**
 * ABR は一部の町字名を CJK互換漢字で持つ。全国751,304レコードのうち938件が該当し、
 * 出現するのは oaza_cho（404件）と koaza（446件）のみ（2026-08-24 のデータで実測）。
 *
 * 「塚」U+FA10 は標準の U+585A と Unicode 上「正規等価」で、適合処理はどちらに
 * 置き換えてもよい。つまり NFC は異体字を潰す操作ではなく、同一文字の符号化を
 * 揃える操作である。実在する異体字（正規分解を持たないもの）は NFC でも変化しない。
 */
describe('toOsmTags の文字正規化', () => {
  /** CJK互換漢字の「塚」。標準形は U+585A */
  const TSUKA_COMPAT = '塚'
  const TSUKA_NFC = '塚'
  /** 「﨑」。正規分解を持たないため NFC でも変化しない。「崎」U+5D0E とは別字 */
  const SAKI = '﨑'

  it('正規等価な互換漢字は NFC 正規形に直す', () => {
    const r = structuredClone(fixture('verified/丁目なし').result)
    r.metadata.machiAza = {
      machiaza_id: '0001000',
      oaza_cho: `戸${TSUKA_COMPAT}町`,
      oaza_cho_k: 'トツカチョウ',
    }
    expect(toOsmTags(r).tags['addr:neighbourhood']).toBe(`戸${TSUKA_NFC}町`)
  })

  it('note に入る残余も正規化する', () => {
    const r = structuredClone(fixture('verified/残余あり').result)
    r.other = `戸${TSUKA_COMPAT}ビル`
    expect(toOsmTags(r).tags.note).toBe(`戸${TSUKA_NFC}ビル`)
  })

  it('正規分解を持たない異体字はそのまま残す', () => {
    const r = structuredClone(fixture('verified/丁目なし').result)
    r.metadata.machiAza = {
      machiaza_id: '0001000',
      oaza_cho: `山${SAKI}町`,
      oaza_cho_k: 'ヤマサキチョウ',
    }
    expect(toOsmTags(r).tags['addr:neighbourhood']).toBe(`山${SAKI}町`)
  })
})

/**
 * NFKC を使うと互換分解まで適用され、別の文字に化ける。
 * 実データの残余に「池田ビルⅢ」（docs/nja-coverage.md の分類A の例）があり、
 * NFKC では「池田ビルIII」になる。建物名を書き換えてはいけない。
 */
describe('toOsmTags の文字正規化は NFC であって NFKC ではない', () => {
  it('互換分解を持つ文字（ローマ数字など）は分解しない', () => {
    const r = structuredClone(fixture('verified/残余あり').result)
    r.other = '池田ビルⅢ 1階'
    expect(toOsmTags(r).tags.note).toBe('池田ビルⅢ 1階')
  })
})
