/**
 * NJA の正規化結果をそのまま覗くための調査用 CLI。
 *
 *   npm run normalize -- '東京都千代田区紀尾井町1-3'
 *   npm run normalize            # 既定のサンプル住所を一括で流す
 */
import { applyApiBase } from '../src/apiBase.ts'
import { normalize, version } from '@geolonia/normalize-japanese-addresses'

// 取得先を NJA_API_BASE に合わせる（未設定なら Geolonia API）
applyApiBase()

const DEFAULT_SAMPLES = [
  '東京都千代田区紀尾井町1-3', // 住居表示 (街区符号 + 住居番号)
  '北海道札幌市中央区北3条西7丁目1', // 政令市の区 + 丁目
  '和歌山県東牟婁郡串本町串本1800', // 郡 + 地番
  '京都府京都市中京区河原町通二条下る一之船入町384', // 通り名付き
  '青森県三戸郡五戸町古舘下タ袋1-2-3 五戸ビル 5F', // 正規化しきれない例
]

const inputs = process.argv.slice(2)
const targets = inputs.length > 0 ? inputs : DEFAULT_SAMPLES

console.error(`# @geolonia/normalize-japanese-addresses v${version}`)
for (const input of targets) {
  const result = await normalize(input)
  console.log(JSON.stringify({ input, result }, null, 2))
}
