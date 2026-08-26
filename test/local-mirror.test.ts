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
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { config, normalize } from '@geolonia/normalize-japanese-addresses'
import { beforeAll, describe, expect, it } from 'vitest'
import { maskChiban } from '../scripts/maskChiban.ts'
import { API_BASE_ENV, applyApiBase } from '../src/apiBase.ts'
import { machiAzaFullName, matchesEmptyString } from '../src/machiAza.ts'
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
  // describe.skipIf(true) でも vitest はこの factory 本体を評価する
  // （子テストを列挙するため）。applyApiBase はミラーが無いと例外を投げるので、
  // factory 直下に置くとスキップしたいはずのファイルごと fail する。
  // beforeAll に入れれば、スキップ時は呼び出し自体が起きない
  beforeAll(() => {
    // 他のテストより先に取得先を差し替える。normalize の初回呼び出しより
    // 前でなければキャッシュが混ざる
    applyApiBase({ [API_BASE_ENV]: MIRROR })
  })

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

/** 全国ミラーかどうか。部分ミラーでは母集団を数えられない */
function isNational(): boolean {
  if (!available) return false
  try {
    return readdirSync(MIRROR, { withFileTypes: true }).filter((e) => e.isDirectory())
      .length === 47
  } catch {
    return false
  }
}

/**
 * 町字マスタを悉皆で走査し、空文字列に一致する町字パターンを持つ自治体を数える。
 *
 * matchesEmptyString は NJA の別名生成の写しなので、上流やデータが変わると
 * 黙って腐る。腐り方は2方向ある。
 *
 * 1. データが変わる（町字マスタの内容が変わり、該当する自治体・町字名が変わる）
 * 2. 規則が変わる（NJA の別名生成の実装が変わり、matchesEmptyString が
 *    もう写しになっていない）
 *
 * 以下の3つの `it` は町字マスタと matchesEmptyString だけを見ており、
 * 1 しか押さえない。2 を押さえるには NJA 自身に問い合わせて実際の挙動を
 * 確認する必要があるため、末尾の `it` でそれを行う。
 * `(?!^町)` を外す変異は統合テストでは1件も落ちず、このテストだけが捕まえる
 * （山形県長井市の町字 `町` が該当してしまい8自治体になる）。
 */
describe.skipIf(!isNational())('捏造される町字の母集団', () => {
  let found = new Map<string, Set<string>>()
  // 述語（matchesEmptyString）より広い候補集合。町字マスタから、町字名が
  // `大`・`字`・`町` の文字だけで構成されるレコードを持つ自治体を拾う
  // （正規表現 /^[大字町]+$/）。述語に当たる4種（大字 字町 字町町 大字町）は
  // すべてこの形なので、found はこの集合の部分集合になる
  let candidates = new Map<string, Set<string>>()
  let cityCount = 0
  let recordCount = 0

  // describe.skipIf(true) でも vitest はこの factory 本体を評価するので、
  // readFileSync(`${MIRROR}.json`) を factory 直下に置くと、ミラーが無い
  // 環境ではスキップしたいはずのファイルごと ENOENT で fail する。
  // beforeAll に入れれば、スキップ時は呼び出し自体が起きない
  beforeAll(() => {
    // このブロックは単体で実行される可能性がある（絞り込み実行）。
    // 「ローカルミラー」ブロックの beforeAll に頼らず、ここでも取得先を
    // 差し替える。applyApiBase は現在の config と一致するときは何もしない
    // 冪等な関数（docs/api.md）なので、両方から呼んでも安全
    applyApiBase({ [API_BASE_ENV]: MIRROR })

    found = new Map<string, Set<string>>()
    candidates = new Map<string, Set<string>>()
    cityCount = 0
    recordCount = 0
    const ja = JSON.parse(readFileSync(`${MIRROR}.json`, 'utf-8'))
    for (const pref of ja.data) {
      for (const city of pref.cities) {
        const name = `${city.county ?? ''}${city.city}${city.ward ?? ''}`
        const path = `${MIRROR}/${pref.pref}/${name}.json`
        if (!existsSync(path)) continue
        cityCount++
        const key = `${pref.pref}${name}`
        for (const t of JSON.parse(readFileSync(path, 'utf-8')).data) {
          recordCount++
          const full = machiAzaFullName(t)
          if (!full) continue
          if (/^[大字町]+$/.test(full)) {
            if (!candidates.has(key)) candidates.set(key, new Set())
            candidates.get(key)!.add(full)
          }
          if (!matchesEmptyString(full)) continue
          if (!found.has(key)) found.set(key, new Set())
          found.get(key)!.add(full)
        }
      }
    }
    // 749,406レコードの走査は、ファイルキャッシュが冷えていると10秒を超える。
    // vitest の既定の hookTimeout は10秒なので、温度次第で落ちるテストになる。
    // 既存の it と同じ余裕を持たせる
  }, 120_000)

  // 走査そのものが全件を見たことを固定する。該当しない自治体がいくつ欠けても
  // 下の2つのアサーションは変わらないので、ミラーが壊れていても緑になってしまう。
  // 数値は 2026-08-24 に構築した全国ミラーの実測値。
  // ミラーを作り直して数が変われば、下の期待値も測り直す必要がある
  it('走査した自治体と町字レコードの数', () => {
    // ja.json は1,898自治体を持つが、実ファイルがあるのは1,892。
    // 欠けている6件は北方領土（色丹村・泊村・留夜別村・留別村・紗那村・蘂取村）
    expect(cityCount).toBe(1892)
    expect(recordCount).toBe(749406)
  })

  // 候補集合（found の上位集合）自体の大きさを固定する。ここが無いと、
  // 正規表現 /^[大字町]+$/ を例えば /^字町$/ のように狭める変異が入っても
  // candidates が found に潰れるだけで、末尾の it（候補と実際の捏造が一致するか）
  // は依然として緑のまま通ってしまう。それでは「found より広い候補で
  // 取りこぼしを検知する」という母集団テストの目的自体が自己参照的になる
  it('候補集合の大きさ', () => {
    expect(candidates.size).toBe(68)
  })

  it('該当する自治体はちょうど7つ', () => {
    expect([...found.keys()].sort()).toEqual(
      [
        '青森県つがる市',
        '青森県上北郡七戸町',
        '宮城県塩竈市',
        '宮城県岩沼市',
        '宮城県柴田郡大河原町',
        '石川県羽咋郡志賀町',
        '熊本県菊池郡大津町',
      ].sort(),
    )
  })

  it('該当する町字名は4種類', () => {
    const names = new Set([...found.values()].flatMap((s) => [...s]))
    expect([...names].sort()).toEqual(['大字', '大字町', '字町', '字町町'].sort())
  })

  // ここまでの3つは町字マスタと matchesEmptyString だけを見ている（データ側）。
  // ここからは NJA 自身に問い合わせ、述語が拾った自治体で実際に町字が
  // 捏造されるかを固定する（規則側）。上流が別名生成の規則を変えても、
  // データ側の3つは1件も落ちない
  //
  // 問い合わせ対象は found.keys()（述語が拾った集合）ではなく candidates.keys()
  // （述語より広い候補集合）にする。found だけを回すと、述語が拾い過ぎる方向
  // （false positive）は捕まえられても、取りこぼす方向（false negative）は
  // 捕まえられない。上流が別名生成の規則を変えて捏造する自治体が増えても、
  // found はその自治体を最初から含まないので、found.keys() を回すテストは
  // 何も検知せず緑のまま通ってしまう。candidates は述語の厳密な上位集合なので、
  // 述語が見落とした自治体もここには入っている
  //
  // ただしこの候補生成にも限界がある。候補は「大」「字」「町」の3文字だけで
  // 構成された町字名からしか作らないので、上流が例えば `鶴見町` のような
  // ごく普通の町名で捏造するように変わった場合はこの候補集合に入らず、
  // このテストは検知できない。ここで固定できるのは「別名生成が大字/字/町の
  // 組み合わせをさらに捏造するようになった」という上流の変化だけ
  it('候補が拾う自治体は、NJA が実際に捏造する自治体と一致する', async () => {
    // このブロック自身の beforeAll で取得先を差し替えている。
    // ここで確認できれば、この it が公開 API を叩いていないと分かる
    expect(config.japaneseAddressesApi).toBe(`file://${MIRROR}`)

    const actual = new Set<string>()
    for (const key of candidates.keys()) {
      // ゎゔぁぃ は全749,406レコードの使用文字から選んだもので、
      // 町字名にも数字にも一致しない。それでも町字が決まれば、
      // 入力を1文字も見ずに決めたということになる
      const r = await normalize(`${key}ゎゔぁぃ`)
      if (r.town) actual.add(key)
    }
    expect(actual).toEqual(new Set(found.keys()))
  })
})
