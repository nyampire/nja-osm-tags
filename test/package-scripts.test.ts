import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * npm script の一覧を固定する。
 *
 * `npm run` は実行するコマンド自体を標準出力に書く。
 * パイプやリダイレクトと組み合わせると、そのバナーが出力の先頭に混ざる。
 * CSV はヘッダの前にごみ行が入り、GeoJSON は JSON として読めなくなる。
 *
 * この罠で README が壊れた実績がある（`npm run batch -- ... > out.csv`）。
 * 文書の側は test/doc-commands.test.ts が押さえるが、それだけでは
 * `npm run` の一覧から見つけて使う人を止められない。
 * そこで `batch` と `normalize` は npm script として置かず、
 * `node bin/batch.ts` / `node scripts/normalize.ts` を直接案内している。
 *
 * ここで一覧そのものを固定するのは、消したものが黙って戻るのを防ぐため。
 * 標準出力にデータを書くコマンドを足すときは、この期待値も直すことになり、
 * そこで一度立ち止まる。
 *
 * `.npmrc` に `loglevel=silent` を置けばバナーは消えるが、採らない。
 * `npm install` の警告まで消え、ネイティブビルドの承認を促す
 * install-scripts の警告も出なくなる（docs/local-mirror.md で使う手順）。
 */
const EXPECTED = [
  'fixtures',
  'fixtures:chiban',
  'test',
  'test:watch',
  'typecheck',
]

/** 標準出力にデータを書くので npm script にしないもの */
const MUST_NOT_EXIST = ['batch', 'normalize']

describe('npm script', () => {
  const scripts: Record<string, string> = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
  ).scripts

  it('一覧が期待どおり', () => {
    expect(Object.keys(scripts).sort()).toEqual(EXPECTED)
  })

  // 上の一覧の固定だけでも戻れば落ちるが、落ちたときに理由が読めない。
  // 名指しで、なぜ置かないのかを message に持たせる
  it.each(MUST_NOT_EXIST)('%s を npm script にしない', (name) => {
    expect(
      scripts[name],
      `npm run ${name} は標準出力にバナーが混ざるため置かない。` +
        `node で直接呼ぶ形を README が案内している`,
    ).toBeUndefined()
  })
})
