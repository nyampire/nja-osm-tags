import type { Options } from './types.ts'

/**
 * note と fixme を作る。
 *
 * note には未処理の残余をそのまま入れる。建物名・階・部屋番号は
 * addr:housename / addr:room / addr:floor と断定できないため、パースしない。
 *
 * fixme は番地要素が3つ以上あったときだけ出す。2要素は推測を含まず、
 * 地番方式は修正すれば直るものではない（意図的に対象外）ため。
 */
export function buildNotes(
  residue: string,
  extraElements: string | undefined,
  options: Options,
): { note?: string; fixme?: string } {
  const out: { note?: string; fixme?: string } = {}
  if (options.note !== false && residue) out.note = residue
  if (options.fixme !== false && extraElements) {
    out.fixme = `番地の3要素目以降を確認: ${extraElements}`
  }
  return out
}
