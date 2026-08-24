/**
 * 取得先切り替えのテスト。
 *
 * `resolveApiBase` は純粋関数なのでネットワークもファイルも使わない。
 * `applyApiBase` は一時ディレクトリに ja.json を置く場合と置かない場合を見る。
 * NJA の `config` はグローバル状態なので、各テストで退避して復元する。
 */
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { config } from '@geolonia/normalize-japanese-addresses'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { API_BASE_ENV, applyApiBase, resolveApiBase } from '../src/apiBase.ts'

describe('resolveApiBase', () => {
  it('未設定なら undefined を返す', () => {
    expect(resolveApiBase(undefined)).toBeUndefined()
    expect(resolveApiBase('')).toBeUndefined()
    // 空白だけの値は「未設定」と同じ扱い。シェルの誤設定を拾わない
    expect(resolveApiBase('   ')).toBeUndefined()
  })

  it('http と https と file はそのまま通す', () => {
    expect(resolveApiBase('https://example.com/api/ja')).toBe(
      'https://example.com/api/ja',
    )
    expect(resolveApiBase('http://localhost:8080/api/ja')).toBe(
      'http://localhost:8080/api/ja',
    )
    expect(resolveApiBase('file:///tmp/out/api/ja')).toBe(
      'file:///tmp/out/api/ja',
    )
  })

  it('パスは cwd 基準で解決して file:// にする', () => {
    const got = resolveApiBase('out/api/ja')
    expect(got).toBe(pathToFileURL(join(process.cwd(), 'out/api/ja')).href)
    expect(got?.startsWith('file://')).toBe(true)
  })

  it('絶対パスも file:// にする', () => {
    expect(resolveApiBase('/tmp/out/api/ja')).toBe('file:///tmp/out/api/ja')
  })

  it('日本語を含むパスを URL エンコードする', () => {
    // 手で %E6%9D%B1... を書かせないための変換。NJA 側は decodeURI で戻す
    const got = resolveApiBase('/tmp/住所/ja')
    expect(got).toBe('file:///tmp/%E4%BD%8F%E6%89%80/ja')
  })

  it('末尾のスラッシュを除去する', () => {
    // NJA は `new URL(base + input)` で組み立て、input は `.json` で始まる。
    // 末尾にスラッシュが残ると `.../ja/.json` という誤ったパスになる
    expect(resolveApiBase('https://example.com/api/ja/')).toBe(
      'https://example.com/api/ja',
    )
    expect(resolveApiBase('https://example.com/api/ja///')).toBe(
      'https://example.com/api/ja',
    )
    expect(resolveApiBase('/tmp/out/api/ja/')).toBe('file:///tmp/out/api/ja')
  })

  it('空白を落とす', () => {
    expect(resolveApiBase('  https://example.com/api/ja  ')).toBe(
      'https://example.com/api/ja',
    )
  })
})

describe('applyApiBase', () => {
  let original: string
  let dir: string

  beforeEach(() => {
    original = config.japaneseAddressesApi
    dir = mkdtempSync(join(tmpdir(), 'nja-api-base-'))
  })

  afterEach(() => {
    config.japaneseAddressesApi = original
    rmSync(dir, { recursive: true, force: true })
  })

  it('未設定なら config に触らない', () => {
    expect(applyApiBase({})).toBeUndefined()
    expect(config.japaneseAddressesApi).toBe(original)
  })

  it('ja.json があれば config を書き換える', () => {
    writeFileSync(join(dir, 'ja.json'), '{}')
    const base = join(dir, 'ja')
    const applied = applyApiBase({ [API_BASE_ENV]: base })
    expect(applied).toBe(pathToFileURL(base).href)
    expect(config.japaneseAddressesApi).toBe(applied)
  })

  it('ja.json がなければパスを添えて落ちる', () => {
    const base = join(dir, 'ja')
    expect(() => applyApiBase({ [API_BASE_ENV]: base })).toThrow(
      /住所データが見つかりません/,
    )
    // どのパスを見に行ったかを出す。打ち間違いを直せるようにするため
    expect(() => applyApiBase({ [API_BASE_ENV]: base })).toThrow(
      join(dir, 'ja.json'),
    )
    // 落ちた場合は config を書き換えない
    expect(config.japaneseAddressesApi).toBe(original)
  })

  it('https は存在確認せずに通す', () => {
    // 起動時にネットワークを使わない。実在しないホストでも落とさない
    const applied = applyApiBase({
      [API_BASE_ENV]: 'https://example.invalid/api/ja',
    })
    expect(applied).toBe('https://example.invalid/api/ja')
    expect(config.japaneseAddressesApi).toBe('https://example.invalid/api/ja')
  })

  it('同じ値なら2回目は何もしない', () => {
    writeFileSync(join(dir, 'ja.json'), '{}')
    const base = join(dir, 'ja')
    const first = applyApiBase({ [API_BASE_ENV]: base })
    // ja.json を消しても、既に適用済みなので検証は走らない。
    // 入口が複数あっても安全に呼べることを担保する
    rmSync(join(dir, 'ja.json'))
    expect(applyApiBase({ [API_BASE_ENV]: base })).toBe(first)
    expect(config.japaneseAddressesApi).toBe(first)
  })
})

describe('取得先の適用漏れ', () => {
  /**
   * `normalize` を直接呼ぶファイルは全て取得先を適用しなければならない。
   *
   * 1箇所でも漏れるとその経路だけ Geolonia API を叩き続ける。
   * 「同じ規則が複数箇所に分かれて片方が腐る」形の不具合をこのリポジトリで
   * 既に5回起こしているので、規約をテストで固定する。
   */
  it('normalize を呼ぶファイルは applyApiBase を通っている', () => {
    const roots = ['src', 'bin', 'scripts']
    const offenders: string[] = []

    for (const root of roots) {
      const dir = new URL(`../${root}/`, import.meta.url)
      for (const name of readdirSync(dir)) {
        if (!name.endsWith('.ts')) continue
        const path = `${root}/${name}`
        const source = readFileSync(new URL(name, dir), 'utf-8')

        // 型だけの import は normalize を呼ばない
        const callsNormalize = /(?<!\w)normalize\(/.test(source)
        if (!callsNormalize) continue

        const applies =
          source.includes('applyApiBase()') ||
          // src/index.ts 経由なら読み込み時に適用済み
          /from '\.{1,2}\/(?:src\/)?index\.ts'/.test(source)
        if (!applies) offenders.push(path)
      }
    }

    expect(
      offenders,
      `applyApiBase() を呼んでいないか src/index.ts を経由していない: ${offenders.join(', ')}`,
    ).toEqual([])
  })
})
