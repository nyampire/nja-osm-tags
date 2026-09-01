import type { FixtureCase, FixtureFile } from '../src/types.ts'
import cases from './fixtures/cases.json' with { type: 'json' }
import chibanCases from './fixtures/chiban-cases.json' with { type: 'json' }
import sheetCases from './fixtures/sheet-cases.json' with { type: 'json' }

/**
 * フィクスチャは JSON なので型が付かない。キャストをここ1箇所に集約する。
 * 各テストで書くと、ファイルの形（`FixtureCase[]` から `FixtureFile` への
 * 変更など）が来たときに直し漏れた箇所だけが黙って通る。
 */
const file = (raw: unknown) => raw as unknown as FixtureFile

/** ファイル名 → 中身。版を検査するテストが meta を読む */
export const fixtureFiles: Record<string, FixtureFile> = {
  'cases.json': file(cases),
  'chiban-cases.json': file(chibanCases),
  'sheet-cases.json': file(sheetCases),
}

export const fixtures = fixtureFiles['cases.json']!.cases
export const chibanFixtures = fixtureFiles['chiban-cases.json']!.cases
export const sheetFixtures = fixtureFiles['sheet-cases.json']!.cases

/** ラベルでフィクスチャを引く */
export function fixture(label: string): FixtureCase {
  const found = fixtures.find((c) => c.label === label)
  if (!found) throw new Error(`フィクスチャが見つかりません: ${label}`)
  return found
}
