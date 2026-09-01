import { describe, expect, it } from 'vitest'
import { PINNED_DATA_VERSION } from '../scripts/dataVersion.ts'
import { fixtureFiles } from './helpers.ts'

/**
 * フィクスチャを生成した住所データの版を固定する。
 *
 * NJA の出力は住所データの版で変わる。同じ40件でも公開 API（2024-12-25）と
 * ローカルミラー（2026-08-24）では出力タグが8行で違う。
 *
 * 版を記録しないと、ミラーを持たない人が `npm run fixtures` を回したときに
 * 期待値が公開 API の値へ黙って戻る。差分を見れば気づけるという想定は
 * 弱い。フィクスチャは1ファイル数万行あり、`meta` を持つ前は
 * `sheet-cases.json` が公開 API 版のまま8行の古い期待値を保持していた。
 *
 * 固定値は `scripts/dataVersion.ts` の `PINNED_DATA_VERSION` 1箇所にある。
 * 生成スクリプトも同じ値を見て、違えば書き込む前に落ちる。
 * ここはその結果が実際にコミットされているかを検査する。
 */
const PINNED = PINNED_DATA_VERSION

describe('フィクスチャの版', () => {
  // 走査対象が空でも it.each は空回りして緑になる。件数を明示的に固定する
  it('版を持つフィクスチャが3つある', () => {
    expect(Object.keys(fixtureFiles).sort()).toEqual([
      'cases.json',
      'chiban-cases.json',
      'sheet-cases.json',
    ])
  })

  for (const [name, file] of Object.entries(fixtureFiles)) {
    it(`${name} が ${PINNED.updated}（${PINNED.source}）で生成されている`, () => {
      expect(
        file.meta,
        `${name} に meta がありません。npm run fixtures で再生成してください`,
      ).toBeDefined()
      expect(
        file.meta,
        `${name} の版が固定値と違います。` +
          `別の取得先で再生成すると期待値が入れ替わります。` +
          `意図した更新なら test/fixture-version.test.ts の PINNED を直してください`,
      ).toEqual(PINNED)
    })
  }

  // cases が空のファイルでも上の版の検査は通る。中身があることを別に押さえる
  it('どのフィクスチャも空でない', () => {
    for (const [name, file] of Object.entries(fixtureFiles)) {
      expect(file.cases.length, `${name} が空です`).toBeGreaterThan(0)
    }
  })
})
