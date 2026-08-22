import { readFile } from 'node:fs/promises'

/**
 * CSV 文字列を行と列に分解する。RFC4180 準拠で、
 * 引用符内の改行とカンマに対応し、先頭の UTF-8 BOM を除去する。
 *
 * 注意: このモジュールは node:fs を使うため、純粋関数である
 * src/toOsmTags.ts およびその依存からは import しない。
 */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQuote = false
  let firstCell = true

  const pushCell = () => {
    if (firstCell) {
      cur = cur.replace(/^\ufeff/, '')
      firstCell = false
    }
    row.push(cur)
    cur = ''
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuote = false
        }
      } else {
        cur += ch
      }
      continue
    }
    if (ch === '"') inQuote = true
    else if (ch === ',') pushCell()
    else if (ch === '\n') {
      pushCell()
      rows.push(row)
      row = []
    } else if (ch !== '\r' && ch !== undefined) cur += ch
  }
  if (cur !== '' || row.length > 0) {
    pushCell()
    rows.push(row)
  }
  return rows
}

/** CSV ファイルを読んで分解する */
export async function parseCsv(url: URL): Promise<string[][]> {
  return parseCsvText(await readFile(url, 'utf8'))
}

/** CSV に書き出す。カンマ・引用符・改行を含む値だけ引用符で囲む */
export function formatCsv(rows: string[][]): string {
  const escape = (v: string) =>
    /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  return rows.map((r) => r.map(escape).join(',')).join('\n') + '\n'
}
