import cases from './fixtures/cases.json' with { type: 'json' }
import type { FixtureCase } from '../src/types.ts'

export const fixtures = cases as unknown as FixtureCase[]

/** ラベルでフィクスチャを引く */
export function fixture(label: string): FixtureCase {
  const found = fixtures.find((c) => c.label === label)
  if (!found) throw new Error(`フィクスチャが見つかりません: ${label}`)
  return found
}
