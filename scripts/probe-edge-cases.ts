import { normalize } from '@geolonia/normalize-japanese-addresses'
const cases = [
  ['無番地', '長野県北安曇郡小谷村千国乙無番地'],
  ['住居表示 支号あり', '東京都港区赤坂9-7-1-1'],
  ['地番 枝番', '和歌山県東牟婁郡串本町串本1800-1'],
  ['地番 枝番2つ', '和歌山県東牟婁郡串本町串本1800-1-2'],
  ['京都 通り名', '京都府京都市中京区河原町通二条下る一之船入町384'],
  ['建物名+階', '東京都千代田区紀尾井町1-3 東京ガーデンテラス紀尾井町 5F'],
  ['大阪 例', '大阪府大阪市浪速区日本橋西一丁目1-3'],
  ['丸の内 例', '東京都千代田区丸の内二丁目7-2'],
  ['算用数字入力', '千葉県流山市江戸川台西4丁目1-1'],
  ['帯広 条丁目', '北海道帯広市西19条南42丁目1-1'],
]
for (const [label, input] of cases) {
  const r = await normalize(input!)
  console.log(`\n### ${label}: ${input}`)
  console.log(`  input(meta)=${JSON.stringify(r.metadata.input)} level=${r.level} other=${JSON.stringify(r.other)}`)
  console.log(`  top: pref=${r.pref} city=${r.city} town=${r.town} addr=${JSON.stringify(r.addr)}`)
  console.log(`  machiAza=${JSON.stringify(r.metadata.machiAza)}`)
  console.log(`  rsdt=${JSON.stringify(r.metadata.rsdt)} chiban=${JSON.stringify(r.metadata.chiban)}`)
}
