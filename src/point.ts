/**
 * この座標を出力してよいか。
 *
 * NJA の `point.level === 8` は「住居表示住所または地番の位置」を意味する。
 * 実データで `level 8` は必ず `metadata.rsdt` か `metadata.chiban` の
 * どちらかを伴う（104件で検証、どちらも無いケースは0件）。
 *
 * `chiban` が絡む `level 8` は地番データの参照結果なので出さない。
 * `chiban` を `rsdt` より優先するのは、番地の決定表（src/numbers.ts）が
 * 同じ優先順位を取っているのと揃えるため。ここがずれると番地は落ちるのに
 * 座標だけ通る穴ができる。
 *
 * ライセンス上の確認が取れていないための保守的な措置。
 */
export function isPointEmittable(
  point: { level: number } | undefined,
  metadata: { rsdt?: unknown; chiban?: unknown },
): boolean {
  if (!point) return false
  if (point.level !== 8) return true
  return !!metadata.rsdt && !metadata.chiban
}
