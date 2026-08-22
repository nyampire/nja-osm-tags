import { describe, expect, it } from 'vitest'
import {
  formatChome,
  kanaHasArabic,
  kanjiToArabicByKana,
  toHankakuDigits,
} from '../src/numerals.ts'

describe('toHankakuDigits', () => {
  it('全角数字を半角に直す', () => {
    expect(toHankakuDigits('第３地割')).toBe('第3地割')
    expect(toHankakuDigits('第１０地割')).toBe('第10地割')
  })

  it('数字以外の全角文字は触らない', () => {
    expect(toHankakuDigits('第３地割Ａ')).toBe('第3地割Ａ')
  })

  it('全角数字がなければそのまま返す', () => {
    expect(toHankakuDigits('永田町')).toBe('永田町')
  })
})

describe('kanaHasArabic', () => {
  it('カナに算用数字が含まれれば true', () => {
    expect(kanaHasArabic('ニシ１９ジョウミナミ')).toBe(true)
    expect(kanaHasArabic('キタ10ジョウニシ')).toBe(true)
  })

  it('含まれなければ false', () => {
    expect(kanaHasArabic('ナガタチョウ')).toBe(false)
    expect(kanaHasArabic('ヤチヨチョウ')).toBe(false)
    expect(kanaHasArabic('スミヨシチヨウイチジヨウ')).toBe(false)
  })

  it('カナが未定義なら false', () => {
    expect(kanaHasArabic(undefined)).toBe(false)
  })
})

describe('kanjiToArabicByKana', () => {
  it('カナに現れる数値の漢数字ランだけを置換する', () => {
    expect(kanjiToArabicByKana('西十九条南', 'ニシ１９ジョウミナミ')).toBe('西19条南')
    expect(kanjiToArabicByKana('北十条西', 'キタ１０ジョウニシ')).toBe('北10条西')
    expect(kanjiToArabicByKana('北三条西', 'キタ３ジョウニシ')).toBe('北3条西')
  })

  it('カナに現れない数値は置換しない（地名の一部を壊さない）', () => {
    expect(kanjiToArabicByKana('八千代町', 'ヤチヨチョウ')).toBe('八千代町')
    expect(kanjiToArabicByKana('一之船入町', 'イチノフナイリチョウ')).toBe('一之船入町')
    expect(kanjiToArabicByKana('住吉町一条', 'スミヨシチヨウイチジヨウ')).toBe('住吉町一条')
  })

  it('漢数字を含まない文字列はそのまま返す', () => {
    expect(kanjiToArabicByKana('市之町西', 'イチノチョウニシ')).toBe('市之町西')
  })

  it('カナが未定義なら何も置換しない', () => {
    expect(kanjiToArabicByKana('西十九条南', undefined)).toBe('西十九条南')
  })

  // 実在の町字。素朴な replace では地名が壊れる（札幌市西区に80レコードある）
  it('ランの位置を取り違えない', () => {
    expect(kanjiToArabicByKana('二十四軒四条', 'ニジュウヨンケン４ジョウ')).toBe('二十四軒4条')
    expect(kanjiToArabicByKana('二十四軒二条', 'ニジュウヨンケン２ジョウ')).toBe('二十四軒2条')
  })

  it('カナの数字トークンの個数を超えて置換しない', () => {
    expect(kanjiToArabicByKana('八軒八条東', 'ハチケン８ジョウヒガシ')).toBe('八軒8条東')
    expect(kanjiToArabicByKana('八軒八条西', 'ハチケン８ジョウニシ')).toBe('八軒8条西')
  })

  it('同じ形で誤変換が起きない大字も引き続き正しい', () => {
    expect(kanjiToArabicByKana('八軒一条東', 'ハチケン１ジョウヒガシ')).toBe('八軒1条東')
    expect(kanjiToArabicByKana('八軒十条西', 'ハチケン１０ジョウニシ')).toBe('八軒10条西')
    expect(kanjiToArabicByKana('二十四軒一条', 'ニジュウヨンケン１ジョウ')).toBe('二十四軒1条')
    expect(kanjiToArabicByKana('二十四軒三条', 'ニジュウヨンケン３ジョウ')).toBe('二十四軒3条')
  })
})

describe('formatChome', () => {
  it('toArabic が false なら chome をそのまま返す', () => {
    expect(formatChome('一丁目', 1, false)).toBe('一丁目')
    expect(formatChome('四十二丁目', 42, false)).toBe('四十二丁目')
  })

  it('toArabic が true なら chome_n を使って算用数字にする', () => {
    expect(formatChome('四十二丁目', 42, true)).toBe('42丁目')
    expect(formatChome('一丁目', 1, true)).toBe('1丁目')
  })

  it('「丁」と「丁目」の区別を保つ', () => {
    expect(formatChome('一丁', 1, true)).toBe('1丁')
    expect(formatChome('一丁', 1, false)).toBe('一丁')
  })

  it('chome_n が無ければ漢数字ランから数値を導く', () => {
    expect(formatChome('一丁目', undefined, true)).toBe('1丁目')
    expect(formatChome('四十二丁目', undefined, true)).toBe('42丁目')
  })

  it('数値を導けなければ chome をそのまま返す', () => {
    expect(formatChome('丁目', undefined, true)).toBe('丁目')
  })
})
