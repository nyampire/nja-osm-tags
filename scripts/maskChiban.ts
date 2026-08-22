import type { NormalizeResult } from '@geolonia/normalize-japanese-addresses'

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
  // chiban の有無で判定を狭めない。出力側（toOsmTags）と同じ積極形で判定する:
  // rsdt に裏付けられていない level 8 は地番由来なのでマスクする。
  if (result.point?.level === 8 && !result.metadata.rsdt) {
    result.point = { lat: 0, lng: 0, level: 8 }
  }
}
