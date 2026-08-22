import type { NormalizeResult } from '@geolonia/normalize-japanese-addresses'
import { isPointEmittable } from '../src/point.ts'

/**
 * 地番の値と地番由来の座標をリポジトリに残さない。
 *
 * テストで必要なのは `metadata.chiban` の存在と `point.level` だけなので、
 * 値は合成値に置き換える。`level 8` は rsdt か chiban のどちらかを伴い、
 * chiban 側の level 8 は地番データの参照結果そのものなので落とす。
 */
export function maskChiban(result: NormalizeResult): void {
  if (result.metadata.chiban) {
    result.metadata.chiban = { prc_num1: '0', prc_num2: '0', prc_num3: '0' }
  }
  // 出力しない座標はリポジトリにも残さない。判定は出力側と同じ述語を使う。
  // 規則を2箇所に書くと必ず片方が腐るため、src/point.ts に集約している。
  if (result.point && !isPointEmittable(result.point, result.metadata)) {
    result.point = { lat: 0, lng: 0, level: result.point.level }
  }
}
