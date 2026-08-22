import type { NormalizeResult } from '@geolonia/normalize-japanese-addresses'
import type { NoNumberReason, NumberSource } from './types.ts'

/** 残余の先頭にある数字ハイフン列 */
const LEADING_NUMBERS = /^\d+(?:-\d+)*/

export type NumberDecision = {
  blockNumber?: string
  housenumber?: string
  numberSource: NumberSource
  noNumberReason?: NoNumberReason
  /** 消費した番地要素を除いた残り。note に回す */
  residue: string
  /** 3要素目以降を - で連結したもの。2要素以下なら undefined。fixme に回す */
  extraElements?: string
}

/**
 * 残余の先頭から番地要素を切り出す。
 *
 * NJA は入力の表記ゆれ（全角数字・全角ハイフン・長音符・`の`・`番`/`号`）を
 * すべて半角数字と半角ハイフンに正規化するため、この正規表現一本で足りる。
 */
export function parseNumberElements(other: string): {
  elements: string[]
  rest: string
} {
  const match = other.match(LEADING_NUMBERS)
  if (!match) return { elements: [], rest: other.trim() }
  const head = match[0]
  return {
    elements: head.split('-'),
    rest: other.slice(head.length).trim(),
  }
}

/**
 * addr:block_number と addr:housenumber を決める。
 *
 * ライセンス要件: metadata.chiban が存在する場合は番地を一切出さない。
 * この判定を最初に置くことで、他の条件と重なっても必ず落ちるようにしている。
 */
export function decideNumbers(result: NormalizeResult): NumberDecision {
  const other = (result.other ?? '').trim()
  const { machiAza, rsdt, chiban } = result.metadata

  // ライセンス境界。地番方式の番地は出さない
  if (chiban) {
    return { numberSource: 'none', noNumberReason: 'chiban', residue: other }
  }

  if (rsdt) {
    const housenumber = rsdt.rsdt_num2
      ? `${rsdt.rsdt_num}-${rsdt.rsdt_num2}`
      : rsdt.rsdt_num
    const decision: NumberDecision = {
      housenumber,
      numberSource: 'verified',
      residue: other,
    }
    if (rsdt.blk_num) decision.blockNumber = rsdt.blk_num
    return decision
  }

  if (!machiAza) {
    return {
      numberSource: 'none',
      noNumberReason: 'machiaza-unresolved',
      residue: other,
    }
  }

  if (machiAza.rsdt !== true) {
    return {
      numberSource: 'none',
      noNumberReason: 'rsdt-not-implemented',
      residue: other,
    }
  }

  const { elements, rest } = parseNumberElements(other)
  const first = elements[0]
  if (first === undefined) {
    return {
      numberSource: 'none',
      noNumberReason: 'rsdt-detail-missing',
      residue: other,
    }
  }

  const second = elements[1]
  const extras = elements.slice(2)
  const residue = [extras.join('-'), rest].filter(Boolean).join(' ')

  const decision: NumberDecision = {
    blockNumber: first,
    numberSource: 'inferred',
    residue,
  }
  if (second !== undefined) decision.housenumber = second
  if (extras.length > 0) decision.extraElements = extras.join('-')
  return decision
}
