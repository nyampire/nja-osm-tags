/**
 * 文書に載せたシェルコマンドの規約テスト。
 *
 * ファイルを読むだけで、コマンドは実行しない。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** 走査対象。README と docs/ の Markdown */
function docFiles(): { path: string; source: string }[] {
  const out = [
    {
      path: 'README.md',
      source: readFileSync(new URL('../README.md', import.meta.url), 'utf-8'),
    },
  ]
  const dir = new URL('../docs/', import.meta.url)
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.md')) continue
    out.push({
      path: `docs/${name}`,
      source: readFileSync(new URL(name, dir), 'utf-8'),
    })
  }
  return out
}

describe('文書のコマンド', () => {
  /**
   * `npm run` は実行するコマンド自体を標準出力に書く。
   * リダイレクトやパイプと組み合わせると、そのバナーが出力の先頭に混ざる。
   * CSV ならヘッダの前にごみ行が入り、GeoJSON は JSON として読めなくなる。
   *
   * README が案内していた `npm run batch -- ... > out.csv` が実際にこれを
   * 起こしていた。`node bin/batch.ts` を直接呼ぶか `npm run --silent` にする。
   *
   * 同じ規則が README・docs/local-mirror.md と複数箇所に分かれるので、
   * テストで固定する。
   */
  it('npm run を出力の取り回しと組み合わせて案内していない', () => {
    // 行頭が `npm run`（`--silent` 付きは除く）で、同じ行に `>` か `|` があるもの。
    // `>` は追記の `>>` も含む。`2>` のようなリダイレクトも拾う
    const pattern = /^\s*npm run (?!--silent\b).*[>|]/

    const offenders: string[] = []
    for (const { path, source } of docFiles()) {
      source.split('\n').forEach((line, i) => {
        // Markdown の表は `|` を含むので、コード行だけを見る。
        // 表の行は必ず `|` で始まる
        if (line.trimStart().startsWith('|')) return
        if (pattern.test(line)) offenders.push(`${path}:${i + 1} ${line.trim()}`)
      })
    }

    expect(
      offenders,
      `npm run のバナーが出力に混ざる。node を直接呼ぶか npm run --silent にする:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
