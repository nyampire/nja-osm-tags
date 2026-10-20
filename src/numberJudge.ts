import { closeSync, existsSync, openSync, readFileSync, readSync } from 'node:fs'
import { join } from 'node:path'
import type { OsmTags } from './types.ts'

/**
 * 番地が 推定 になった行を、町字マスタの明細で引き直す。
 *
 * NJA は住居表示の明細に当たらなかった番地を 推定 として返す。入力の残余を
 * ハイフンで区切り、最初の数字を街区符号、次を住居番号として読んだだけの
 * 状態で、実在は確かめていない。numbers.ts はこの行の番地を出さない。
 *
 * 推定 には性質の違うものが混ざっている。高知市大膳町の街区符号は7番までで、
 * 入力の `大膳町37` は街区符号ではありえないが、地番の明細には37がある。
 * 地番と分かるなら、備考にそう書ける。
 *
 * 値を出せるようにはならない。numbers.ts のライセンス要件により、
 * 地番方式の番地は出さないと決まっている。地番と確定することは、
 * 出してはいけない値だと確定することである。変わるのは 備考 の1文と、
 * 作業者が現地で何を調べるかである。
 *
 * 判定そのもの（detailNumbers と judgeNumber）はファイルもネットワークも
 * 触らないので、明細を手で書いた逆テストで固定できる。ミラーを読むのは
 * loadTowns と loadDetail で、読み直しを減らすキャッシュは makeNumberJudge が持つ。
 */

export type DetailKind = '住居表示' | '地番'

/** 町字1つ分の明細。明細ファイルが無い種別は null */
export type Detail = { 住居表示: Set<string> | null; 地番: Set<string> | null }

export type NumberJudgement = '' | '地番' | '不一致' | '判定不能'

/** 明細ファイル内のバイト範囲 */
export type CsvRange = { start: number; length: number }

/** 町字マスタの1町字分。使う項目だけを書く */
export type TownRecord = {
  oaza_cho?: string
  chome?: string
  koaza?: string
  csv_ranges?: Partial<Record<DetailKind, CsvRange>>
}

/**
 * 明細の1町字分を、番地の集合として読む。
 *
 * 1行目が `地番,<町字名>` か `住居表示,<町字名>`、2行目が列名なので読み飛ばす。
 * 3列目までが番地の要素で、地番は prc_num1〜3、住居表示は blk_num、
 * rsdt_num、rsdt_num2 に入る。どちらも同じ位置なので1つの関数で読める。
 *
 * 要素はハイフンでつなぐ。addr:block_number と addr:housenumber も
 * 同じ形でつながっているため、そのまま突き合わせられる。
 */
export function detailNumbers(text: string): Set<string> {
  const out = new Set<string>()
  const lines = String(text).split('\n')
  for (let i = 2; i < lines.length; i++) {
    const c = (lines[i] ?? '').split(',')
    if (!c[0]) continue
    out.add([c[0], c[1], c[2]].filter(Boolean).join('-'))
  }
  return out
}

/**
 * 推定 になった1行の番地を、町字の明細に照らして判定する。
 *
 * detail は { 住居表示: Set|null, 地番: Set|null }。町字そのものを
 * 引けなかった行では null を渡す。
 *
 * 返す値は4つ。
 *
 *   地番      地番の明細に番地がある。住居表示の明細の有無は問わない
 *   不一致    住居表示の明細はあるが、どちらの明細にも番地が無い
 *   判定不能  住居表示の明細が無く、地番の明細にも番地が無い
 *   空文字    判定しない。番地が落ちていない行と、住居表示の明細に
 *             番地が丸ごとある行
 *
 * 突き合わせは街区符号と住居番号の組で行う。街区符号だけで見ると、
 * 本番データの1,487行が住居表示に当たったように見えるが、その全てで
 * 住居番号は台帳に無い。NJA も組で照合するので、街区符号だけの一致を
 * 「住居表示にある」と読むと、NJA が当てられなかった理由を見失う。
 *
 * 住居表示の明細が無い町字で地番に一致した行を 地番 に入れるのは、
 * 判定を分ける材料が他に無いためである。町字の rsdt フラグは真なのに
 * ミラーに明細が無い状態で、街区符号だった可能性は排除できない。
 * 本番データでは16,387行がここに入り、うち住居表示の明細を持つ町字の行は
 * 2,245行だった。
 */
export function judgeNumber(
  blockNumber: string | undefined,
  housenumber: string | undefined,
  detail: Detail | null,
): NumberJudgement {
  const blk = String(blockNumber || '').trim()
  if (!blk) return ''
  const full = [blk, String(housenumber || '').trim()].filter(Boolean).join('-')

  if (!detail) return '判定不能'
  const rsdt = detail['住居表示']
  const chiban = detail['地番']

  if (rsdt && rsdt.has(full)) return ''
  if (chiban && chiban.has(full)) return '地番'
  if (!rsdt) return '判定不能'
  return '不一致'
}

/** 町字名。machiAzaName と同じ組み立てにする */
export function townName(t: TownRecord): string {
  return `${t.oaza_cho || ''}${t.chome || ''}${t.koaza || ''}`
}

/**
 * 町字マスタの1市区町村分を、町字名で引ける形で読む。
 *
 * 町字名で引き、値には csv_ranges だけを残す。ファイルが無ければ null を返す。
 *
 * 長く動くサーバでは全国の約1,900市区町村分を持ち続けることになり、
 * 町字の全項目を残すと 200MB を超える。判定に要るのは明細の位置だけなので、
 * かな、ローマ字、座標などは読んだ時点で捨てる。
 */
export function loadTowns(base: string, pref: string, city: string): Map<string, TownRecord> | null {
  const p = join(base, pref, `${city}.json`)
  if (!existsSync(p)) return null
  const out = new Map<string, TownRecord>()
  const json = JSON.parse(readFileSync(p, 'utf8')) as { data: TownRecord[] }
  for (const t of json.data) {
    const n = townName(t)
    if (n && !out.has(n)) out.set(n, { csv_ranges: t.csv_ranges })
  }
  return out
}

/**
 * 明細ファイルの一部だけを読む。
 *
 * 1市区町村分の明細は数十MBになるので、町字の csv_ranges が指す範囲だけを
 * 読む。ファイルの先頭には町字名と範囲の索引が置かれており、csv_ranges の
 * start はその後ろを指す。索引は読まない。
 */
export function loadDetail(
  base: string,
  pref: string,
  city: string,
  kind: DetailKind,
  range: CsvRange,
): Set<string> | null {
  const p = join(base, pref, `${city}-${kind}.txt`)
  if (!existsSync(p)) return null
  const fd = openSync(p, 'r')
  try {
    const buf = Buffer.alloc(range.length)
    readSync(fd, buf, 0, range.length, range.start)
    return detailNumbers(buf.toString('utf8'))
  } finally {
    closeSync(fd)
  }
}

/**
 * map を上限 max 件のキャッシュとして引く。
 *
 * 無ければ load で読んで入れる。引いたものは末尾に回し、上限を超えたら
 * 先頭（最も長く引かれていないもの）から捨てる。Map の挿入順を使う。
 */
function cachedGet<V>(map: Map<string, V>, key: string, max: number, load: () => V): V {
  let value: V
  if (map.has(key)) {
    value = map.get(key) as V
    map.delete(key)
  } else {
    value = load()
  }
  map.set(key, value)
  while (map.size > max) {
    const oldest = map.keys().next()
    if (oldest.done) break
    map.delete(oldest.value)
  }
  return value
}

/**
 * 推定のまま残った行の番地を、町字の明細に照らして判定する関数を返す。
 *
 * base は out/api/ja のファイルシステムのパス。numberSource が inferred か
 * どうかの確認は呼ぶ側が行う。照合済みの行は番地を出しており、番地が無い行は
 * 落ちるものが無いので、判定しない。
 *
 * 町字マスタも明細も市区町村ごとのファイルなので、読み直しを減らすために
 * キャッシュする。どちらも上限を設け、超えたら最も長く引かれていないものから
 * 捨てる。長く動くサーバでは、上限が無いと全国分がたまり続けるためである。
 * 町字マスタは市区町村ごとに maxCities 件（既定 200）まで持つ。loadTowns が
 * 明細の位置だけに絞っても、全国の約1,900件で 100MB を超える。
 * 明細は町字ごとに数KBから数百KBあるため、maxDetails 件（既定 500）まで持つ。
 */
export function makeNumberJudge(
  base: string,
  options: { maxDetails?: number; maxCities?: number } = {},
): (tags: OsmTags) => NumberJudgement {
  const maxDetails = options.maxDetails ?? 500
  const maxCities = options.maxCities ?? 200
  const towns = new Map<string, Map<string, TownRecord> | null>()
  const details = new Map<string, Set<string> | null>()

  return (tags) => {
    const pref = (tags['addr:province'] || '').trim()
    const city = (['addr:county', 'addr:city', 'addr:suburb'] as const)
      .map((k) => (tags[k] || '').trim()).join('')
    const town = (['addr:quarter', 'addr:neighbourhood'] as const)
      .map((k) => (tags[k] || '').trim()).join('')
    const blk = (tags['addr:block_number'] || '').trim()
    if (!blk) return ''
    if (!pref || !city || !town) return '判定不能'

    const cityKey = `${pref}/${city}`
    const master = cachedGet(towns, cityKey, maxCities, () => loadTowns(base, pref, city))
    const rec = master ? master.get(town) : null
    if (!rec) return '判定不能'

    const ranges = rec.csv_ranges || {}
    const detail: Detail = { 住居表示: null, 地番: null }
    for (const kind of ['住居表示', '地番'] as const) {
      const range = ranges[kind]
      if (!range) continue
      detail[kind] = cachedGet(details, `${cityKey}/${kind}/${range.start}`, maxDetails,
        () => loadDetail(base, pref, city, kind, range))
    }
    return judgeNumber(blk, tags['addr:housenumber'], detail)
  }
}
