import { describe, expect, it } from 'vitest'
import { parseCsv } from '../src/csv.ts'
import { machiAzaTags } from '../src/machiAza.ts'
import { sheetFixtures as cases } from './helpers.ts'

/**
 * OSM 表の各住所に対する本ツールの出力（確定値）。
 * 表と一致する行も、意図的に異なる行も、両方を明示的に固定する。
 * 表と同じ住所が2回出てくる行（流山市鰭ケ崎）があるので、住所で引く。
 *
 * 固定しているのはフィクスチャ（`test/fixtures/sheet-cases.json`）の値で、
 * フィクスチャはローカルミラー（2026-08-24）で生成してある。
 * 版は `meta` に記録してあり、`test/fixture-version.test.ts` が固定する。
 *
 * ここは NJA の出力ではなく本ツールの変換を固定する場所なので、
 * 住所データの版が変われば期待値も変わる。表との突き合わせは
 * docs/osm-tagging-spec.md にあり、同じ版で測ってある。
 */
const EXPECTED: Record<string, { quarter?: string; neighbourhood?: string }> = {
  '東京都千代田区永田町一丁目': { neighbourhood: '永田町一丁目' },
  '東京都江戸川区二之江町': { neighbourhood: '二之江町' },
  '千葉県市川市湊新田': { neighbourhood: '湊新田' },
  '千葉県市川市湊新田二丁目': { neighbourhood: '湊新田二丁目' },
  '青森県南津軽郡藤崎町藤崎西村井': { quarter: '大字藤崎', neighbourhood: '字西村井' },
  '福島県郡山市堂前町': { neighbourhood: '堂前町' },
  '福島県郡山市北畑': { neighbourhood: '字北畑' },
  '福島県郡山市日和田町広野入': { quarter: '日和田町', neighbourhood: '広野入' },
  '福島県郡山市日和田町八丁目堰山': { quarter: '日和田町八丁目', neighbourhood: '堰山' },
  '福島県郡山市安積町長久保一丁目': { neighbourhood: '安積町長久保一丁目' },
  '福島県郡山市安積町笹川西長久保': { quarter: '安積町笹川', neighbourhood: '西長久保' },
  '福島県郡山市安積町日出山一丁目': { neighbourhood: '安積町日出山一丁目' },
  '福島県郡山市安積町日出山一本松': { quarter: '安積町日出山', neighbourhood: '一本松' },
  '福島県郡山市安積町大森町': { neighbourhood: '安積町大森町' },
  '福島県郡山市安積町柴宮東': { quarter: '安積町', neighbourhood: '柴宮東' },
  '青森県八戸市番町': { neighbourhood: '大字番町' },
  '青森県八戸市河原木': { neighbourhood: '河原木' },
  '青森県八戸市河原木河原木後': { quarter: '大字河原木', neighbourhood: '字河原木後' },
  '青森県八戸市南郷大字中野舘野': { quarter: '南郷大字中野', neighbourhood: '字舘野' },
  '千葉県松戸市北松戸三丁目': { neighbourhood: '北松戸三丁目' },
  '千葉県松戸市南花島中町': { neighbourhood: '南花島中町' },
  // ミラーには素の `イ` のレコードが無く、`イ字愛宕` のように小字を伴うものだけ。
  // 入力が小字を書いていないため照合できず、町字が出ない
  '千葉県旭市イ': {},
  '千葉県香取市佐原ロ': { neighbourhood: '佐原ロ' },
  '千葉県流山市鰭ケ崎': { neighbourhood: '大字鰭ケ崎' },
  '千葉県流山市鰭ケ崎一丁目': { neighbourhood: '鰭ケ崎一丁目' },
  '千葉県流山市江戸川台西4丁目': { neighbourhood: '江戸川台西四丁目' },
  '北海道帯広市西19条南42丁目': { neighbourhood: '西19条南42丁目' },
  '大阪府堺市堺区市之町西1丁': { neighbourhood: '市之町西一丁' },
  '神奈川県横浜市鶴見区朝日町1丁目': { neighbourhood: '朝日町一丁目' },
  '神奈川県横浜市旭区二俣川1丁目': { neighbourhood: '二俣川一丁目' },
  '静岡県下田市二丁目': { neighbourhood: '2丁目' },
  '兵庫県姫路市広畑区富士町': { neighbourhood: '広畑区富士町' },
  '兵庫県姫路市大津区大津町二丁目': { neighbourhood: '大津区大津町二丁目' },
  '長野県長野市大字鶴賀権堂町': { quarter: '大字鶴賀', neighbourhood: '権堂町' },
  '長野県長野市若里': { neighbourhood: '大字若里' },
  '長野県長野市若里七丁目': { neighbourhood: '若里七丁目' },
  // NJA が machiAza を { machiaza_id: '0000000' } のプレースホルダで返すため
  // 町字名が1つも取れない。空が正解
  '茨城県龍ケ崎市寺後': {},
  '鹿児島県志布志市志布志町志布志二丁目': { neighbourhood: '志布志町志布志二丁目' },
  '岩手県久慈市夏井町夏井第3地割': { quarter: '夏井町夏井', neighbourhood: '第3地割' },
}

/**
 * 表と異なる行とその理由。
 * 「大字/字を残す」決定と「既知の限界」に対応する。
 *
 * 郡山市の小字5行はここにあったが、ミラー（2026-08-24）では ABR 側が
 * `koaza` から `字` を落としており、表と一致するようになった。
 * 接頭辞を残す方針は変えていない。データが接頭辞を持たなくなっただけ。
 */
const SHEET_DIFF: Record<string, string> = {
  '青森県南津軽郡藤崎町藤崎西村井': '「大字」「字」の接頭辞を残す方針',
  '福島県郡山市北畑': '「大字」「字」の接頭辞を残す方針',
  '青森県八戸市番町': '「大字」「字」の接頭辞を残す方針',
  '青森県八戸市河原木河原木後': '「大字」「字」の接頭辞を残す方針',
  '青森県八戸市南郷大字中野舘野': '「大字」「字」の接頭辞を残す方針',
  '千葉県流山市鰭ケ崎': '「大字」「字」の接頭辞を残す方針',
  '千葉県流山市江戸川台西4丁目': '丁目の告示表記が ABR に無く漢数字になる',
  '大阪府堺市堺区市之町西1丁': '丁目の告示表記が ABR に無く漢数字になる',
  '神奈川県横浜市鶴見区朝日町1丁目': '丁目の告示表記が ABR に無く漢数字になる',
  '神奈川県横浜市旭区二俣川1丁目': '丁目の告示表記が ABR に無く漢数字になる',
  '長野県長野市大字鶴賀権堂町': '「大字」「字」の接頭辞を残す方針',
  '千葉県旭市イ': 'ミラーに素の「イ」のレコードが無く町字を特定できない',
  '静岡県下田市二丁目': '大字のカナが算用数字のため 2丁目 に書き換わる',
  '長野県長野市若里': '「大字」「字」の接頭辞を残す方針',
  '茨城県龍ケ崎市寺後': 'NJA が町字を特定できない',
  '岩手県久慈市夏井町夏井第3地割': '「第○地割」を neighbourhood に入れる（表は捨てる）',
}

describe('OSM 表との回帰', () => {
  it('40行ある', () => {
    expect(cases).toHaveLength(40)
  })

  for (const c of cases) {
    it(c.input, () => {
      const expectedTags = EXPECTED[c.input]
      expect(expectedTags, `EXPECTED に ${c.input} がない`).toBeDefined()
      expect(machiAzaTags(c.result.metadata.machiAza)).toEqual(expectedTags)
    })
  }

  it('表と異なるのは記録済みの行だけ', async () => {
    const rows = (
      await parseCsv(new URL('../scripts/osm-japan-tagging-examples.csv', import.meta.url))
    ).slice(3)

    const actualDiff = new Set<string>()
    for (const row of rows) {
      const address = row[0]
      if (!address) continue
      const sheetQuarter = row[8] ?? ''
      const sheetNeighbourhood = row[9] ?? ''
      const ours = EXPECTED[address]
      if (!ours) continue
      if (
        sheetQuarter !== (ours.quarter ?? '') ||
        sheetNeighbourhood !== (ours.neighbourhood ?? '')
      ) {
        actualDiff.add(address)
      }
    }

    expect([...actualDiff].sort()).toEqual(Object.keys(SHEET_DIFF).sort())
  })
})
