import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeNumberJudge, resolveApiBase } from '../src/index.ts'
import { parseCsvText } from '../src/csv.ts'
import type { OsmTags } from '../src/index.ts'

const buildDir = process.env.JP_HEALTHCARE_BUILD_DIR
const apiBase = process.env.NJA_API_BASE

/**
 * jp-healthcare-osm の geocoded CSV にある「番地の判定」と、
 * ここで公開した判定が同じ結果を返すことを確かめる。
 * 行の値は保存しない（地番と判定された行の番地が地番そのものであるため）。
 */
describe.skipIf(!buildDir || !apiBase)('番地の判定: jp-healthcare-osm との照合', () => {
  it('高知県の推定行で、番地の判定の列と一致する', () => {
    const judge = makeNumberJudge(fileURLToPath(resolveApiBase(apiBase)!))
    const rows: { tags: OsmTags; expected: string }[] = []
    for (const file of readdirSync(buildDir!).filter((f) => f.endsWith('_geocoded.csv'))) {
      const text = readFileSync(join(buildDir!, file), 'utf8').replace(/^﻿/, '')
      const [header = [], ...body] = parseCsvText(text)
      const col = (name: string) => header.indexOf(name)
      const idx = {
        province: col('addr:province'),
        source: col('番地の根拠'),
        judged: col('番地の判定'),
      }
      for (const r of body) {
        if (r[idx.province] !== '高知県' || r[idx.source] !== '推定') continue
        const tags: Record<string, string> = {}
        for (const [i, name] of header.entries()) {
          if (name.startsWith('addr:')) tags[name] = r[i] ?? ''
        }
        rows.push({ tags, expected: r[idx.judged] ?? '' })
      }
    }

    const mismatches: string[] = []
    const counts: Record<string, number> = {}
    for (const { tags, expected } of rows) {
      const actual = judge(tags)
      counts[actual] = (counts[actual] ?? 0) + 1
      if (actual !== expected) mismatches.push(`${expected}->${actual}`)
    }
    expect(rows.length).toBe(79)
    expect(mismatches).toEqual([])
    expect(counts).toEqual({ 判定不能: 38, 地番: 33, 不一致: 8 })
  })
})
