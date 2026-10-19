import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detailNumbers, judgeNumber, makeNumberJudge } from '../src/numberJudge.ts'

/** 高知市大膳町。街区符号は7番までで、地番には37がある */
const DAIZEN = {
  住居表示: detailNumbers('住居表示,大膳町\nblk_num,rsdt_num,rsdt_num2,lng,lat\n'
    + '1,1,,133.5,33.5\n1,2,,133.5,33.5\n7,1,,133.5,33.5\n'),
  地番: detailNumbers('地番,大膳町\nprc_num1,prc_num2,prc_num3,lng,lat\n'
    + '37,,,,\n38,1,,,\n'),
}

/** 高知市横浜東町。街区符号に10が無く、地番にも10が無い */
const YOKOHAMA = {
  住居表示: detailNumbers('住居表示,横浜東町\nblk_num,rsdt_num,rsdt_num2,lng,lat\n'
    + '9,1,,133.5,33.5\n11,1,,133.5,33.5\n'),
  地番: detailNumbers('地番,横浜東町\nprc_num1,prc_num2,prc_num3,lng,lat\n'
    + '12,,,,\n'),
}

/** 住居表示の明細を持たない町字。地番の明細だけがある */
const NO_RSDT = {
  住居表示: null,
  地番: detailNumbers('地番,某町\nprc_num1,prc_num2,prc_num3,lng,lat\n'
    + '37,,,,\n'),
}

/** どちらの明細も持たない町字 */
const NO_DETAIL = { 住居表示: null, 地番: null }

describe('judgeNumber', () => {
  it('地番の明細に一致すれば 地番', () => {
    expect(judgeNumber('37', '', DAIZEN)).toBe('地番')
  })
  it('枝番まで一致すれば 地番', () => {
    expect(judgeNumber('38', '1', DAIZEN)).toBe('地番')
  })
  it('どちらの明細にも無ければ 不一致', () => {
    expect(judgeNumber('10', '1', YOKOHAMA)).toBe('不一致')
  })
  it('住居表示の明細が無くても地番に一致すれば 地番', () => {
    expect(judgeNumber('37', '', NO_RSDT)).toBe('地番')
  })
  it('住居表示の明細が無く地番にも無ければ 判定不能', () => {
    expect(judgeNumber('40', '', NO_RSDT)).toBe('判定不能')
  })
  it('どちらの明細も無ければ 判定不能', () => {
    expect(judgeNumber('40', '', NO_DETAIL)).toBe('判定不能')
  })
  it('町字を引けなければ 判定不能', () => {
    expect(judgeNumber('40', '', null)).toBe('判定不能')
  })
  it('番地が無ければ判定しない', () => {
    expect(judgeNumber('', '', DAIZEN)).toBe('')
  })
  // 住居表示の明細に番地が丸ごとある行は判定を保留する。
  // 本番データでは0件だが、出たときに「どちらの明細にも無い」と
  // 書くと事実と違う文が出る。
  it('住居表示の明細に一致すれば判定を保留する', () => {
    expect(judgeNumber('1', '2', DAIZEN)).toBe('')
  })
  // 街区符号だけの一致では住居表示に当たったことにしない。
  it('街区符号だけの一致は住居表示に当たったことにしない', () => {
    expect(judgeNumber('1', '9', DAIZEN)).toBe('不一致')
  })
})

describe('detailNumbers', () => {
  const d = detailNumbers('地番,大膳町\nprc_num1,prc_num2,prc_num3,lng,lat\n'
    + '37,,,,\n38,1,,,\n39,1,2,,\n\n')
  it('先頭2行を読み飛ばす', () => {
    expect(d.has('prc_num1')).toBe(false)
  })
  it('枝番の無い地番を読む', () => {
    expect(d.has('37')).toBe(true)
  })
  it('枝番をハイフンでつなぐ', () => {
    expect(d.has('38-1')).toBe(true)
  })
  it('3要素目までつなぐ', () => {
    expect(d.has('39-1-2')).toBe(true)
  })
  it('空行を落とす', () => {
    expect(d.size).toBe(3)
  })
})

describe('makeNumberJudge', () => {
  let base: string
  const head = '地番,大膳町\nprc_num1,prc_num2,prc_num3,lng,lat\n37,,,,\n'
  const tags = (city: string, town: string, blk: string) => ({
    'addr:province': '高知県', 'addr:city': city,
    'addr:neighbourhood': town, 'addr:block_number': blk,
  })

  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), 'numberJudge-'))
    mkdirSync(join(base, '高知県'))
    writeFileSync(join(base, '高知県', '高知市-地番.txt'), head)
    writeFileSync(join(base, '高知県', '高知市.json'), JSON.stringify({
      data: [{
        oaza_cho: '大膳町',
        csv_ranges: { 地番: { start: 0, length: Buffer.byteLength(head) } },
      }],
    }))
  })
  afterAll(() => rmSync(base, { recursive: true, force: true }))

  it('町字の台帳を引いて地番と判定する', () => {
    const judge = makeNumberJudge(base)
    expect(judge(tags('高知市', '大膳町', '37'))).toBe('地番')
  })
  it('市区町村の台帳が無ければ判定不能', () => {
    expect(makeNumberJudge(base)(tags('無い市', '大膳町', '37'))).toBe('判定不能')
  })
  it('明細のキャッシュは maxDetails を超えると古いものから捨てる', () => {
    const dir = mkdtempSync(join(tmpdir(), 'numberJudge-lru-'))
    try {
      mkdirSync(join(dir, '高知県'))
      const a = '地番,甲町\nprc_num1,prc_num2,prc_num3,lng,lat\n37,,,,\n'
      const b = '地番,乙町\nprc_num1,prc_num2,prc_num3,lng,lat\n38,,,,\n'
      const la = Buffer.byteLength(a)
      const lb = Buffer.byteLength(b)
      const file = join(dir, '高知県', '高知市-地番.txt')
      writeFileSync(file, a + b)
      writeFileSync(join(dir, '高知県', '高知市.json'), JSON.stringify({
        data: [
          { oaza_cho: '甲町', csv_ranges: { 地番: { start: 0, length: la } } },
          { oaza_cho: '乙町', csv_ranges: { 地番: { start: la, length: lb } } },
        ],
      }))
      const judge = makeNumberJudge(dir, { maxDetails: 1 })
      expect(judge(tags('高知市', '甲町', '37'))).toBe('地番')
      expect(judge(tags('高知市', '乙町', '38'))).toBe('地番')
      // 甲町は捨てられているはずなので、書き換えが次の呼び出しに効く
      writeFileSync(file, a.replace('37', '99') + b)
      expect(judge(tags('高知市', '甲町', '37'))).toBe('判定不能')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
