/**
 * CSV を一括変換して addr:* 列と備考列を足す。
 *
 *   node bin/batch.ts --address-column 所在地 \
 *     --lat-column '所在地座標（緯度）' --lng-column '所在地座標（経度）' \
 *     sample/05_pharmacy_20260601.csv > out.csv
 *
 * 分類による振り分けはしない。_番地の根拠 と _備考 で絞るほうが柔軟。
 */
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

export async function run(options: RunOptions): Promise<string> {
  const rows = await parseCsv(options.input)
  const header = rows[0]
  if (!header) throw new Error('CSV が空です')

  const addressIndex = header.indexOf(options.addressColumn)
  if (addressIndex < 0) {
    throw new Error(`列が見つかりません: ${options.addressColumn}`)
  }
  const latIndex = options.latColumn ? header.indexOf(options.latColumn) : -1
  const lngIndex = options.lngColumn ? header.indexOf(options.lngColumn) : -1

  const added = [...OSM_TAG_COLUMNS, ...META_COLUMNS]
  const out: string[][] = [[...header, ...added]]

  for (const row of rows.slice(1)) {
    if (row.length === 1 && row[0] === '') continue
    const address = row[addressIndex] ?? ''
    if (!address.trim()) {
      out.push([...row, ...added.map(() => '')])
      continue
    }
    const result = await addressToOsmTags(address)
    const columns = toColumns(result, {
      lat: latIndex >= 0 ? toNumber(row[latIndex]) : undefined,
      lng: lngIndex >= 0 ? toNumber(row[lngIndex]) : undefined,
    })
    out.push([...row, ...added.map((c) => columns[c] ?? '')])
  }
  return formatCsv(out)
}

function parseArgs(argv: string[]): RunOptions {
  let addressColumn: string | undefined
  let latColumn: string | undefined
  let lngColumn: string | undefined
  const positional: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--address-column') addressColumn = argv[++i]
    else if (arg === '--lat-column') latColumn = argv[++i]
    else if (arg === '--lng-column') lngColumn = argv[++i]
    else if (arg !== undefined) positional.push(arg)
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

// CLI として直接実行されたときだけ動かす
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')) {
  process.stdout.write(await run(parseArgs(process.argv.slice(2))))
}
