/**
 * ローカルミラーが Geolonia API と同じ結果を返すことを確認する。
 *
 * ミラーが無い環境では skip する。
 *
 * 同一プロセスで「API で1回引いてからミラーに切り替えて引き直す」比較はできない。
 * NJA は取得したデータを LRU にキャッシュするので、2回目はミラーを読まずに
 * キャッシュを返す。実測で確認済み（空のミラーに切り替えても同じ結果が返る）。
 *
 * そこでミラー単独で引き、固定済みの API 記録（test/fixtures/）と突き合わせる。
 * フィクスチャは NJA v3.1.3 の API 出力を maskChiban で加工して保存したもの。
 * 同じマスクを通してから比べれば、ミラーが API と等価であることを確認できる。
 *
 * このファイルは NJA の取得先を書き換えるので、他のテストと同居させない。
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { config, normalize } from '@geolonia/normalize-japanese-addresses'
import { describe, expect, it } from 'vitest'
import { maskChiban } from '../scripts/maskChiban.ts'
import { API_BASE_ENV, applyApiBase } from '../src/apiBase.ts'
import type { FixtureCase } from '../src/types.ts'

const MIRROR = fileURLToPath(
  new URL('../.data/japanese-addresses-v2/out/api/ja', import.meta.url),
)
const available = existsSync(`${MIRROR}.json`)

/** ミラーに含まれる自治体。settings.json の lgCodes と対応する */
const CITY_CODES = new Map([
  [131016, '千代田区'],
  [52019, '秋田市'],
  [304280, '東牟婁郡串本町'],
])

function load(name: string): FixtureCase[] {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf-8'),
  )
}

/** ミラーの範囲に入るフィクスチャだけを取り出す */
function inMirror(): FixtureCase[] {
  return [...load('cases.json'), ...load('sheet-cases.json')].filter((c) =>
    CITY_CODES.has(c.result.metadata?.city?.code ?? -1),
  )
}

describe.skipIf(!available)('ローカルミラー', () => {
  // 他のテストより先に取得先を差し替える。normalize の初回呼び出しより
  // 前でなければキャッシュが混ざる
  applyApiBase({ [API_BASE_ENV]: MIRROR })

  const cases = inMirror()

  it('対象フィクスチャが存在する', () => {
    // 0件でも each が空回りして緑になるので、件数を明示的に固定する
    expect(cases.length).toBeGreaterThan(0)
    expect(config.japaneseAddressesApi).toBe(`file://${MIRROR}`)
  })

  it.each(cases)('$input が API の記録と一致する', async ({ input, result }) => {
    const got = await normalize(input)
    // フィクスチャは地番の値と地番由来の座標をマスクして保存している。
    // 生成側（scripts/make-fixtures.ts）と同じ関数を通してから比べる
    maskChiban(got)
    expect(got).toEqual(result)
  }, 60_000)
})
