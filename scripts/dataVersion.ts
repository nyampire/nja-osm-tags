/**
 * 住所データの版を読み、フィクスチャを固定した版と突き合わせる。
 *
 * 単体で走らせるものではなく、フィクスチャ生成とテストから呼ばれるヘルパ。
 *
 * NJA の出力は住所データの版で変わる。版を記録しないと、別の取得先で
 * 再生成したときに期待値が黙って入れ替わる。
 * 実際に `test/fixtures/sheet-cases.json` は公開 API で作られたまま残り、
 * ミラーではツールが出さない値を8行にわたって固定していた。
 *
 * ## `updated` の意味は取得先で違う
 *
 * 公開 API の `updated` は Geolonia が配信データを作った時刻で、上流の版を
 * 指す。ミラーの `updated` は**手元でビルドした時刻**で、上流の版ではない。
 * `japanese-addresses-v2` の `01_make_prefecture_city.ts` が
 * `Math.floor(Date.now() / 1000)` を書くため、同じ上流データから作り直しても
 * 値が変わる。
 *
 * したがってミラーの `updated` が違っても、中身まで違うとは限らない。
 * 生成側は「違えば止める」で正しい（作り直したミラーで黙って再生成させない）
 * が、ミラーとフィクスチャを突き合わせるテストの側では、版の違いを
 * 失敗の判定には使わず、失敗したときの手がかりとして添えるだけにする。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { config } from '@geolonia/normalize-japanese-addresses'
import type { DataVersion } from '../src/types.ts'

/**
 * フィクスチャを固定している版。**ここが唯一の固定点。**
 *
 * 生成スクリプトはこれと違う版では書き込まない。
 * `test/fixture-version.test.ts` はフィクスチャの `meta` がこれと一致するか
 * を検査する。版を上げるときはここを直す。
 */
export const PINNED_DATA_VERSION: DataVersion = {
  updated: '2026-08-24',
  source: 'mirror',
}

/** 固定した版と違っても生成を通す逃げ道。版を上げるときに使う */
export const OVERRIDE_ENV = 'FIXTURE_ALLOW_NEW_VERSION'

/**
 * 住所データの版を読む。索引（`{base}.json`）の `meta.updated` を見る。
 *
 * `base` を省略すると、いま NJA が向いている取得先を読む。
 * その場合は `applyApiBase()` のあとに呼ぶこと。
 */
export async function dataVersion(base = config.japaneseAddressesApi): Promise<DataVersion> {
  const source = base.startsWith('file://') ? 'mirror' : 'api'
  const index = `${base}.json`
  const raw =
    source === 'mirror'
      ? readFileSync(fileURLToPath(index), 'utf-8')
      : await (await fetch(index)).text()
  const updated = JSON.parse(raw).meta?.updated
  if (typeof updated !== 'number') {
    throw new Error(`住所データの版を読めません: ${index}`)
  }
  return {
    updated: new Date(updated * 1000).toISOString().slice(0, 10),
    source,
  }
}

const show = (v: DataVersion) => `${v.updated}（${v.source}）`

/**
 * 固定した版でなければ落とす。**フィクスチャを書き込む前に呼ぶこと。**
 *
 * 書いてしまってからテストで落とすと、作業ツリーを汚したうえで
 * `git checkout test/fixtures/` を強いることになる。
 */
export function assertPinnedDataVersion(found: DataVersion): void {
  const pinned = PINNED_DATA_VERSION
  if (found.updated === pinned.updated && found.source === pinned.source) return
  if (process.env[OVERRIDE_ENV]) {
    process.stderr.write(
      `${OVERRIDE_ENV} が設定されているので続行します: ` +
        `${show(pinned)} → ${show(found)}\n` +
        `書き出したあとに scripts/dataVersion.ts の PINNED_DATA_VERSION も直してください\n`,
    )
    return
  }
  throw new Error(
    `住所データの版が固定値と違うため、フィクスチャを書き換えません。\n` +
      `  固定値  ${show(pinned)}\n` +
      `  取得先  ${show(found)}\n` +
      (found.source === 'api'
        ? `公開 API で再生成すると期待値が8行で入れ替わります。` +
          `ローカルミラーを向けてください:\n` +
          `  NJA_API_BASE=.data/japanese-addresses-v2/out/api/ja npm run fixtures\n`
        : `ミラーの updated はビルド時刻なので、作り直すと中身が同じでも変わります。\n` +
          `中身の変化は npm test（local-mirror.test.ts）で確かめられます。\n`) +
      `意図して版を上げる場合は ${OVERRIDE_ENV}=1 を付けて実行し、` +
      `scripts/dataVersion.ts の PINNED_DATA_VERSION も直してください。`,
  )
}
