/**
 * CSV を一括変換して addr:* 列と備考列を足す。
 *
 *   node bin/batch.ts --address-column 所在地 \
 *     --lat-column '所在地座標（緯度）' --lng-column '所在地座標（経度）' \
 *     sample/05_pharmacy_20260601.csv > out.csv
 *
 * --format geojson で FeatureCollection を出す。座標が決まらない行は
 * geometry を null にして残す（RFC 7946 が許す形）。
 *
 * 分類による振り分けはしない。_番地の根拠 と _備考 で絞るほうが柔軟。
 */
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { formatCsv, parseCsv } from '../src/csv.ts'
import { addressToOsmTags } from '../src/index.ts'
import {
  META_COLUMNS,
  OSM_TAG_COLUMNS,
  toColumns,
  toGeoJsonFeature,
} from '../src/serialize.ts'
import type { GeoJsonFeature } from '../src/serialize.ts'

export type OutputFormat = 'csv' | 'geojson'

export type RunOptions = {
  /** 出力形式。既定は csv */
  format?: OutputFormat
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
  const geojson = options.format === 'geojson'
  const out: string[][] = [[...header, ...added]]
  const features: GeoJsonFeature[] = []
  let rowNumber = 2 // 1行目はヘッダ

  /** 元データの列を GeoJSON の properties に持ち込む。空の値は入れない */
  const sourceProperties = (row: string[]): Record<string, string> => {
    const props: Record<string, string> = {}
    for (const [i, name] of header.entries()) {
      const value = row[i]
      if (name && value) props[name] = value
    }
    return props
  }

  for (const row of rows.slice(1)) {
    // ファイル末尾の空行は飛ばす。1列の CSV では正当なデータ行と区別が
    // つかないので、2列以上あるときだけ空行スキップを適用する
    if (row.length === 1 && row[0] === '' && header.length > 1) continue

    // 行の長さをヘッダに揃える。揃えずに列を足すと、追加列がヘッダの
    // 別の位置に入って出力全体の対応が崩れる。
    //
    // 短い行は埋める（末尾の空フィールドを省略する CSV 生成系は珍しくない）。
    // 長い行は埋めようがないので落とす。黙って切り詰めるとデータが消え、
    // 黙って通すと列がずれるので、行番号を添えて失敗するのが一番親切。
    const padded = normalizeRowLength(row, header.length, rowNumber)

    // 数万行だと生きているか分からないので進捗を stderr に出す
    if (rowNumber % 500 === 0) {
      process.stderr.write(`${rowNumber} 行処理\n`)
    }
    rowNumber++

    const address = padded[addressIndex] ?? ''
    if (!address.trim()) {
      if (geojson) {
        features.push({
          type: 'Feature',
          geometry: null,
          properties: sourceProperties(padded),
        })
      } else {
        out.push([...padded, ...added.map(() => '')])
      }
      continue
    }

    const coord = {
      lat: latIndex >= 0 ? toNumber(padded[latIndex]) : undefined,
      lng: lngIndex >= 0 ? toNumber(padded[lngIndex]) : undefined,
    }

    try {
      const result = await addressToOsmTags(address)
      if (geojson) {
        features.push(toGeoJsonFeature(result, coord, sourceProperties(padded)))
      } else {
        const columns = toColumns(result, coord)
        out.push([...padded, ...added.map((c) => columns[c] ?? '')])
      }
    } catch (error) {
      // 1行の失敗で数万行のバッチを落とさない。理由を _備考 に出して続ける。
      // 利用者は _備考 で絞れば失敗行だけを取り出せる
      const reason = `変換に失敗: ${
        error instanceof Error ? error.message : String(error)
      }`
      if (geojson) {
        features.push({
          type: 'Feature',
          geometry: null,
          properties: { ...sourceProperties(padded), _備考: reason },
        })
      } else {
        const columns: Record<string, string> = Object.fromEntries(
          added.map((c) => [c, '']),
        )
        columns['_備考'] = reason
        out.push([...padded, ...added.map((c) => columns[c] ?? '')])
      }
    }
  }

  if (geojson) {
    return `${JSON.stringify({ type: 'FeatureCollection', features }, null, 2)}\n`
  }
  // BOM なし UTF-8 だと日本語 Windows の Excel で文字化けする。
  // _ 接頭辞の列は Excel で開いて絞り込むためのものなので、BOM を付ける
  return '﻿' + formatCsv(out)
}

function parseArgs(argv: string[]): RunOptions {
  let addressColumn: string | undefined
  let latColumn: string | undefined
  let lngColumn: string | undefined
  let format: OutputFormat | undefined
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
    else if (arg === '--format') {
      const v = value(++i, arg)
      if (v !== 'csv' && v !== 'geojson') {
        throw new Error(`--format は csv か geojson のみです: ${v}`)
      }
      format = v
    } else if (arg.startsWith('--')) {
      throw new Error(`不明なオプション: ${arg}`)
    } else positional.push(arg)
  }

  const file = positional[0]
  if (!file || !addressColumn) {
    throw new Error(
      '使い方: node bin/batch.ts --address-column <列名> [--lat-column <列名>] [--lng-column <列名>] [--format csv|geojson] <input.csv>',
    )
  }
  const options: RunOptions = {
    input: pathToFileURL(resolve(file)),
    addressColumn,
  }
  if (format) options.format = format
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
