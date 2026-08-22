/**
 * CSV を一括変換して addr:* 列と備考列を足す。
 *
 *   node bin/batch.ts --address-column 所在地 \
 *     --lat-column '所在地座標（緯度）' --lng-column '所在地座標（経度）' \
 *     sample/05_pharmacy_20260601.csv > out.csv
 *
 * 分類による振り分けはしない。_番地の根拠 と _備考 で絞るほうが柔軟。
 */
import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { formatCsv, parseCsv } from '../src/csv.ts'
import { addressToOsmTags } from '../src/index.ts'
import { META_COLUMNS, OSM_TAG_COLUMNS, toColumns } from '../src/serialize.ts'

export type RunOptions = {
  input: URL
  addressColumn: string
  latColumn?: string
  lngColumn?: string
}

function toNumber(v: string | undefined): number | undefined {
  if (v === undefined || v.trim() === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/**
 * 行の長さをヘッダに揃える。
 *
 * 出力の不変条件は「どの行も `header.length + added.length` 列を持つ」。
 * 短い行を埋めるだけでは不十分で、長い行を通すと追加列がヘッダの別の位置に
 * 入って対応が崩れる。長い行は埋めようがないので、行番号を添えて落とす。
 */
function normalizeRowLength(
  row: string[],
  width: number,
  rowNumber: number,
): string[] {
  if (row.length === width) return row
  if (row.length < width) {
    return [...row, ...Array<string>(width - row.length).fill('')]
  }
  throw new Error(
    `${rowNumber} 行目の列数がヘッダより多いです（ヘッダ ${width} 列、行 ${row.length} 列）。` +
      '引用符の閉じ忘れなど、入力 CSV の形式を確認してください',
  )
}

export async function run(options: RunOptions): Promise<string> {
  const rows = await parseCsv(options.input)
  const header = rows[0]
  if (!header) throw new Error('CSV が空です')

  // 指定された列が見つからなければ必ず落とす。座標列だけ黙って無視すると、
  // 列名を打ち間違えたユーザーが「座標が全部代表点で補完された」ことに気づけない
  // `undefined` は「フラグ未指定」を意味し -1 を返す。必須かどうかの区別は
  // 型（RunOptions.addressColumn が必須）と parseArgs が担う
  const columnIndex = (name: string | undefined): number => {
    if (name === undefined) return -1
    const index = header.indexOf(name)
    if (index < 0) throw new Error(`列が見つかりません: ${name}`)
    return index
  }
  const addressIndex = columnIndex(options.addressColumn)
  const latIndex = columnIndex(options.latColumn)
  const lngIndex = columnIndex(options.lngColumn)

  const added = [...OSM_TAG_COLUMNS, ...META_COLUMNS]
  const out: string[][] = [[...header, ...added]]
  let rowNumber = 2 // 1行目はヘッダ

  for (const row of rows.slice(1)) {
    // ファイル末尾の空行は飛ばす
    if (row.length === 1 && row[0] === '') continue

    // 行の長さをヘッダに揃える。揃えずに列を足すと、追加列がヘッダの
    // 別の位置に入って出力全体の対応が崩れる。
    //
    // 短い行は埋める（末尾の空フィールドを省略する CSV 生成系は珍しくない）。
    // 長い行は埋めようがないので落とす。黙って切り詰めるとデータが消え、
    // 黙って通すと列がずれるので、行番号を添えて失敗するのが一番親切。
    const padded = normalizeRowLength(row, header.length, rowNumber++)

    const address = padded[addressIndex] ?? ''
    if (!address.trim()) {
      out.push([...padded, ...added.map(() => '')])
      continue
    }
    const result = await addressToOsmTags(address)
    const columns = toColumns(result, {
      lat: latIndex >= 0 ? toNumber(padded[latIndex]) : undefined,
      lng: lngIndex >= 0 ? toNumber(padded[lngIndex]) : undefined,
    })
    out.push([...padded, ...added.map((c) => columns[c] ?? '')])
  }
  return formatCsv(out)
}

function parseArgs(argv: string[]): RunOptions {
  let addressColumn: string | undefined
  let latColumn: string | undefined
  let lngColumn: string | undefined
  const positional: string[] = []

  /** フラグの値を取り出す。欠落や別フラグの巻き込みを落とす */
  const value = (i: number, flag: string): string => {
    const v = argv[i]
    if (v === undefined || v.startsWith('--')) {
      throw new Error(`${flag} に値がありません`)
    }
    return v
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === undefined) continue
    if (arg === '--address-column') addressColumn = value(++i, arg)
    else if (arg === '--lat-column') latColumn = value(++i, arg)
    else if (arg === '--lng-column') lngColumn = value(++i, arg)
    else if (arg.startsWith('--')) throw new Error(`不明なオプション: ${arg}`)
    else positional.push(arg)
  }

  const file = positional[0]
  if (!file || !addressColumn) {
    throw new Error(
      '使い方: node bin/batch.ts --address-column <列名> [--lat-column <列名>] [--lng-column <列名>] <input.csv>',
    )
  }
  const options: RunOptions = {
    input: new URL(file, `file://${process.cwd()}/`),
    addressColumn,
  }
  if (latColumn) options.latColumn = latColumn
  if (lngColumn) options.lngColumn = lngColumn
  return options
}

/**
 * CLI として直接実行されたか。
 *
 * ベース名の後方一致で判定すると2つの穴がある。
 * - シンボリックリンク経由で起動すると `process.argv[1]` はリンクのパス、
 *   `import.meta.url` は実体のパスになり、一致せず何もしない（偽陰性）
 * - 同名の別ファイルがエントリポイントでこのモジュールを import すると
 *   一致してしまい CLI が起動する（偽陽性）
 *
 * `realpath` で解決したうえで完全一致を見ると両方とも塞がる
 * （直接実行=true、リンク経由=true、import された場合=false を実測で確認）。
 */
function isMain(): boolean {
  const entry = process.argv[1]
  if (!entry) return false
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href
  } catch {
    // argv[1] が解決できない場合は「エントリではない」に倒す。
    // 直接実行では Node が既に argv[1] を解決してこのモジュールを読み込んでいるので、
    // ここが失敗するのは import された側のパスが壊れている場合だけ
    return false
  }
}

if (isMain()) {
  process.stdout.write(await run(parseArgs(process.argv.slice(2))))
}
