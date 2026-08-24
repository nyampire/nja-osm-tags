/**
 * NJA の住所データ取得先を切り替える。
 *
 * 既定は Geolonia の API。環境変数 `NJA_API_BASE` を設定すると、そこを読む。
 * ローカルに japanese-addresses-v2 を構築した場合は `out/api/ja` を指す。
 *
 * 切り替えの経路を環境変数1本に絞っている。`normalize` を呼ぶ入口が
 * bin/batch.ts と scripts/ 配下で計7箇所あり、CLI フラグや設定ファイルを
 * 足すと同じ規則が複数箇所に分かれて片方が腐る。
 *
 * NJA の `config` はモジュール全体で共有されるグローバル状態なので、
 * 変換関数の引数として都度渡す形は取れない。
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { config } from '@geolonia/normalize-japanese-addresses'

/** 環境変数の名前。ドキュメントとエラーメッセージで参照する */
export const API_BASE_ENV = 'NJA_API_BASE'

/**
 * 値を NJA が受け付ける URL 文字列に正規化する。未設定なら `undefined`。
 *
 * `http://` `https://` `file://` で始まれば URL として扱い、
 * それ以外は cwd 基準のパスとして解決して `file://` に変換する。
 * `out/api/ja` のようなパスを渡せるようにするためで、日本語を含むパスを
 * 手で URL エンコードさせない。
 *
 * 末尾のスラッシュは除去する。NJA は `new URL(base + input)` で組み立て、
 * `input` が `.json` で始まるため、末尾にスラッシュがあると
 * `.../ja/.json` という誤ったパスになる。
 */
export function resolveApiBase(raw: string | undefined): string | undefined {
  const value = raw?.trim()
  if (!value) return undefined
  const url = /^(?:https?|file):\/\//.test(value)
    ? value
    : pathToFileURL(resolve(value)).href
  return url.replace(/\/+$/, '')
}

/**
 * 取得先を解決して NJA の `config` に書く。適用した値を返す。
 *
 * `file://` の場合は `{base}.json` の存在を確認し、なければ落とす。
 * ミラーの中身の欠けは検証しない。`lgCodes` で絞った部分ミラーは正当な用途で、
 * 欠けた行は bin/batch.ts の行単位 try/catch が `_備考` に記録して続行する。
 *
 * `https://` は起動時に安く検証できないのでそのまま通す。
 *
 * 現在の `config` の値と一致する場合は何もしない。隠れた状態を持たずに
 * 冪等になるので、複数の入口から呼んでも安全。
 */
export function applyApiBase(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const base = resolveApiBase(env[API_BASE_ENV])
  if (!base) return undefined
  if (config.japaneseAddressesApi === base) return base

  if (base.startsWith('file://')) {
    const index = fileURLToPath(`${base}.json`)
    if (!existsSync(index)) {
      throw new Error(
        `住所データが見つかりません: ${index}\n` +
          `${API_BASE_ENV} には japanese-addresses-v2 の out/api/ja を指定してください`,
      )
    }
  }

  config.japaneseAddressesApi = base
  // 数時間かかるバッチで API を叩いていないことを確認できる必要がある
  process.stderr.write(`住所データの取得先: ${base}\n`)
  return base
}
