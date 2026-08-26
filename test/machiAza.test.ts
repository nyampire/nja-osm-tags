import { describe, expect, it } from 'vitest'
import type { NormalizeResult } from '@geolonia/normalize-japanese-addresses'
import {
  dropFabricatedMachiAza,
  hasMachiAzaName,
  machiAzaFullName,
  machiAzaTags,
  matchesEmptyString,
} from '../src/machiAza.ts'
import type { MachiAza } from '../src/types.ts'

const m = (o: Partial<MachiAza>): MachiAza => ({ machiaza_id: '0000000', ...o }) as MachiAza

describe('machiAzaTags', () => {
  it('chome があれば oaza_cho と連結して neighbourhood にする', () => {
    expect(machiAzaTags(m({ oaza_cho: '永田町', oaza_cho_k: 'ナガタチョウ', chome: '一丁目', chome_n: 1 })))
      .toEqual({ neighbourhood: '永田町一丁目' })
  })

  it('koaza があれば oaza_cho を quarter、koaza を neighbourhood にする', () => {
    expect(machiAzaTags(m({ oaza_cho: '大字藤崎', oaza_cho_k: 'オオアザフジサキ', koaza: '字西村井' })))
      .toEqual({ quarter: '大字藤崎', neighbourhood: '字西村井' })
  })

  // 丁目のあとに方角が付く町名は、chome フィールドに入らないため ABR が
  // koaza に入れる（南郷通十四丁目南 -> oaza_cho=南郷通 + koaza=十四丁目南）。
  // 意味は丁目なので分割しない
  it('koaza が丁目の続きなら分割せず連結する', () => {
    expect(machiAzaTags(m({
      oaza_cho: '南郷通', oaza_cho_k: 'ナンゴウドオリ', koaza: '十四丁目南', koaza_k: '１４チョウメ',
    }))).toEqual({ neighbourhood: '南郷通14丁目南' })

    expect(machiAzaTags(m({
      oaza_cho: '平和通', oaza_cho_k: 'ヘイワドオリ', koaza: '一丁目北', koaza_k: '１チョウメ',
    }))).toEqual({ neighbourhood: '平和通1丁目北' })
  })

  it('1フィールドで来ても同じ出力になる', () => {
    const split = machiAzaTags(m({
      oaza_cho: '南郷通', oaza_cho_k: 'ナンゴウドオリ', koaza: '十四丁目南', koaza_k: '１４チョウメ',
    }))
    const whole = machiAzaTags(m({
      oaza_cho: '南郷通14丁目南', oaza_cho_k: 'ナンゴウドオリ１４チョウメミナミ',
    }))
    expect(split).toEqual(whole)
  })

  it('丁目形でない koaza は連結せず分割したまま', () => {
    // 「方八丁」は地名。先頭が数字ではないので丁目の続きではない
    expect(machiAzaTags(m({
      oaza_cho: '安積町荒井', oaza_cho_k: 'アサカマチアライ', koaza: '字方八丁', koaza_k: 'アザホウハッチョウ',
    }))).toEqual({ quarter: '安積町荒井', neighbourhood: '字方八丁' })

    // 郡山市の小字。丁目を含むが先頭が数字ではない
    expect(machiAzaTags(m({
      oaza_cho: '日和田町八丁目', oaza_cho_k: 'ヒワダマチハッチョウメ', koaza: '字堰山', koaza_k: 'アザセキヤマ',
    }))).toEqual({ quarter: '日和田町八丁目', neighbourhood: '字堰山' })
  })

  it('どちらもなければ oaza_cho を neighbourhood にする', () => {
    expect(machiAzaTags(m({ oaza_cho: '二之江町', oaza_cho_k: 'ニノエチョウ' })))
      .toEqual({ neighbourhood: '二之江町' })
  })

  it('「大字」「字」の接頭辞を除去しない', () => {
    expect(machiAzaTags(m({ oaza_cho: '字北畑', oaza_cho_k: 'アザキタハタ' })))
      .toEqual({ neighbourhood: '字北畑' })
    expect(machiAzaTags(m({ oaza_cho: '大字若里', oaza_cho_k: 'オオアザワカサト' })))
      .toEqual({ neighbourhood: '大字若里' })
  })

  it('カナが算用数字なら oaza_cho と chome の両方を算用数字にする', () => {
    expect(machiAzaTags(m({
      oaza_cho: '西十九条南', oaza_cho_k: 'ニシ１９ジョウミナミ', chome: '四十二丁目', chome_n: 42,
    }))).toEqual({ neighbourhood: '西19条南42丁目' })
  })

  it('カナが漢数字なら両方とも漢数字のまま', () => {
    expect(machiAzaTags(m({
      oaza_cho: '丸の内', oaza_cho_k: 'マルノウチ', chome: '二丁目', chome_n: 2,
    }))).toEqual({ neighbourhood: '丸の内二丁目' })
  })

  it('「丁」の表記を保つ', () => {
    expect(machiAzaTags(m({
      oaza_cho: '市之町西', oaza_cho_k: 'イチノチョウニシ', chome: '一丁', chome_n: 1,
    }))).toEqual({ neighbourhood: '市之町西一丁' })
  })

  it('oaza_cho がなく chome だけでも neighbourhood を作る', () => {
    expect(machiAzaTags(m({ chome: '二丁目', chome_n: 2 })))
      .toEqual({ neighbourhood: '二丁目' })
  })

  it('koaza のカナも数字表記の判定に使う', () => {
    expect(machiAzaTags(m({
      oaza_cho: '夏井町夏井', oaza_cho_k: 'ナツイチョウナツイ', koaza: '第三地割', koaza_k: 'ダイ３チワリ',
    }))).toEqual({ quarter: '夏井町夏井', neighbourhood: '第3地割' })
  })

  it('全角数字は常に半角に直す（カナが漢数字読みでも）', () => {
    expect(machiAzaTags(m({
      oaza_cho: '夏井町夏井', oaza_cho_k: 'ナツイチョウナツイ', koaza: '第３地割', koaza_k: 'ダイサンチワリ',
    }))).toEqual({ quarter: '夏井町夏井', neighbourhood: '第3地割' })
    expect(machiAzaTags(m({
      oaza_cho: '旭町', oaza_cho_k: 'アサヒチョウ', koaza: '第１０地割', koaza_k: 'ダイジユツチワリ',
    }))).toEqual({ quarter: '旭町', neighbourhood: '第10地割' })
  })

  it('oaza_cho がなく koaza だけなら quarter は出さない', () => {
    expect(machiAzaTags(m({ koaza: '千国', koaza_k: 'チクニ' })))
      .toEqual({ neighbourhood: '千国' })
  })

  it('machiAza が未定義なら空を返す', () => {
    expect(machiAzaTags(undefined)).toEqual({})
  })

  it('町字名を1つも持たないプレースホルダなら空を返す', () => {
    expect(machiAzaTags(m({}))).toEqual({})
  })
})

describe('hasMachiAzaName', () => {
  it('未定義なら false', () => {
    expect(hasMachiAzaName(undefined)).toBe(false)
  })

  it('machiaza_id だけのプレースホルダなら false', () => {
    expect(hasMachiAzaName(m({}))).toBe(false)
  })

  it('oaza_cho / chome / koaza のいずれかがあれば true', () => {
    expect(hasMachiAzaName(m({ oaza_cho: '永田町' }))).toBe(true)
    expect(hasMachiAzaName(m({ chome: '一丁目' }))).toBe(true)
    expect(hasMachiAzaName(m({ koaza: '字北畑' }))).toBe(true)
  })
})

describe('matchesEmptyString', () => {
  // NJA は `町` を落とした別名を登録し、`大?字` を任意にする。
  // 両方が重なると `字町` の別名 `字` が `(大?字)?` になり空文字列に一致する
  it.each(['大字', '字町', '字町町', '大字町'])(
    '%s は空文字列に一致しうる',
    (name) => {
      expect(matchesEmptyString(name)).toBe(true)
    },
  )

  // 先頭の `町` は上流が `(?!^町)` で除いているので落とさない。
  // `町` そのものの町字は山形県長井市と石川県羽咋郡志賀町に、
  // `町町` は志賀町に実在する
  it.each(['町', '町町', '鶴見町', '字沢端', '大字結城', '大町', '紀尾井町'])(
    '%s は空文字列に一致しない',
    (name) => {
      expect(matchesEmptyString(name)).toBe(false)
    },
  )
})

/**
 * 判定に必要な最小の NormalizeResult を組む。
 * dropFabricatedMachiAza が見るのは metadata.input と metadata.city と
 * metadata.machiAza と point の4つ。
 */
const nr = (
  input: string,
  city: { county?: string; city: string; ward?: string; point?: [number, number] },
  machiAza?: Partial<MachiAza>,
  point?: { lat: number; lng: number; level: number },
): NormalizeResult =>
  ({
    other: '',
    level: 3,
    point,
    metadata: {
      input,
      city,
      machiAza: machiAza ? m(machiAza) : undefined,
    },
  }) as unknown as NormalizeResult

const dropped = (r: NormalizeResult): boolean =>
  dropFabricatedMachiAza(r).metadata.machiAza === undefined

describe('machiAzaFullName', () => {
  it('大字・丁目・小字を連結する', () => {
    expect(machiAzaFullName(m({ oaza_cho: '安積町', koaza: '字柴宮東' })))
      .toBe('安積町字柴宮東')
    expect(machiAzaFullName(m({ oaza_cho: '永田町', chome: '一丁目' })))
      .toBe('永田町一丁目')
  })
})

describe('dropFabricatedMachiAza', () => {
  it('入力に町字が無ければ落とす', () => {
    expect(dropped(nr('宮城県塩竈市', { city: '塩竈市' }, { oaza_cho: '字町' })))
      .toBe(true)
  })

  it('入力に町字が書かれていれば落とさない', () => {
    expect(dropped(nr('宮城県塩竈市字町1-2', { city: '塩竈市' }, { oaza_cho: '字町' })))
      .toBe(false)
  })

  it('字を省いた入力でも落とさない', () => {
    expect(dropped(nr('宮城県塩竈市町1-2', { city: '塩竈市' }, { oaza_cho: '字町' })))
      .toBe(false)
  })

  // 該当7自治体のうち4つは自治体名自体に `町` を含む。入力全体を探すと
  // 字を落とした形 `町` が自治体名に当たり、判定が効かなくなる
  it('自治体名に町を含んでも、市区町村より後ろだけを見る', () => {
    expect(dropped(nr('青森県上北郡七戸町', { county: '上北郡', city: '七戸町' }, { oaza_cho: '字町' })))
      .toBe(true)
    expect(dropped(nr('石川県羽咋郡志賀町', { county: '羽咋郡', city: '志賀町' }, { oaza_cho: '字町町' })))
      .toBe(true)
    expect(dropped(nr('熊本県菊池郡大津町', { county: '菊池郡', city: '大津町' }, { oaza_cho: '大字町' })))
      .toBe(true)
  })

  it('郡を省いた入力でも市区町村の位置を見つける', () => {
    expect(dropped(nr('青森県七戸町', { county: '上北郡', city: '七戸町' }, { oaza_cho: '字町' })))
      .toBe(true)
    expect(dropped(nr('青森県七戸町字町1-2', { county: '上北郡', city: '七戸町' }, { oaza_cho: '字町' })))
      .toBe(false)
  })

  // 町字名が `大字` そのものだと、字を落とした形が空文字列になる。
  // 空文字列はどの入力にも含まれるので、探索に使うと判定が効かなくなる
  it('字を落とすと空になる町字名でも落とせる', () => {
    expect(dropped(nr('青森県つがる市', { city: 'つがる市' }, { oaza_cho: '大字' })))
      .toBe(true)
    expect(dropped(nr('青森県つがる市大字1-2', { city: 'つがる市' }, { oaza_cho: '大字' })))
      .toBe(false)
    // NJA は `つがる市字1-2` を `大字` に解決する（パターン `(大?字)?` が `字` に一致）
    expect(dropped(nr('青森県つがる市字1-2', { city: 'つがる市' }, { oaza_cho: '大字' })))
      .toBe(false)
  })

  // `字町` は字を落とすと `町` の1文字になる。残り全体を探すと
  // 建物名に `町` が入るだけで判定が効かなくなる
  it('町字名は市区町村の直後にあるものだけを見る', () => {
    expect(dropped(nr('宮城県塩竈市ゎゔぁぃ町内会館前1-2', { city: '塩竈市' }, { oaza_cho: '字町' })))
      .toBe(true)
  })

  it('大字を補って書かれていても落とさない', () => {
    expect(dropped(nr('宮城県塩竈市大字町1-2', { city: '塩竈市' }, { oaza_cho: '字町' })))
      .toBe(false)
  })

  it('市区町村と町字の間に空白があっても落とさない', () => {
    expect(dropped(nr('宮城県塩竈市　字町1-2', { city: '塩竈市' }, { oaza_cho: '字町' })))
      .toBe(false)
  })

  // 岩沼市は塩竈市と同型（郡なし）、大河原町は七戸町と同型（郡あり）。
  // 該当7自治体を悉皆にする
  it('残る2自治体も落とせる', () => {
    expect(dropped(nr('宮城県岩沼市ゎゔぁぃ', { city: '岩沼市' }, { oaza_cho: '字町' })))
      .toBe(true)
    expect(dropped(nr('宮城県柴田郡大河原町ゎゔぁぃ', { county: '柴田郡', city: '大河原町' }, { oaza_cho: '字町' })))
      .toBe(true)
  })

  it('述語に当たらない町字は落とさない', () => {
    expect(dropped(nr('神奈川県横浜市鶴見区鶴見中央', { city: '横浜市', ward: '鶴見区' }, { oaza_cho: '鶴見町' })))
      .toBe(false)
    expect(dropped(nr('山形県長井市', { city: '長井市' }, { oaza_cho: '町' })))
      .toBe(false)
    expect(dropped(nr('東京都千代田区紀尾井町1-3', { city: '千代田区' }, { oaza_cho: '紀尾井町' })))
      .toBe(false)
  })

  it('町字名を持たない結果はそのまま返す', () => {
    const r = nr('宮城県多賀城市八幡', { city: '多賀城市' })
    expect(dropFabricatedMachiAza(r)).toBe(r)
  })

  // 市区町村の位置が出せないときは落とさない（安全側）
  it('入力に市区町村名が見つからなければ落とさない', () => {
    expect(dropped(nr('宮城県しおがま市', { city: '塩竈市' }, { oaza_cho: '字町' })))
      .toBe(false)
  })

  it('落とすときは元の結果を書き換えない', () => {
    const r = nr('宮城県塩竈市', { city: '塩竈市' }, { oaza_cho: '字町' })
    dropFabricatedMachiAza(r)
    expect(r.metadata.machiAza).toBeDefined()
  })

  // 落とした町字の代表点（level 3）が point に残ると、「町字を特定できず」
  // なのに座標だけ町字レベルの精度で出るという自己矛盾が起きる
  it('落とすとき、point を市区町村代表点（level 2）に差し替える', () => {
    const r = dropFabricatedMachiAza(
      nr(
        '宮城県塩竈市',
        { city: '塩竈市', point: [141.0, 38.0] },
        { oaza_cho: '字町' },
        { lat: 38.5, lng: 141.5, level: 3 },
      ),
    )
    expect(r.point).toEqual({ lat: 38.0, lng: 141.0, level: 2 })
  })

  it('落とすとき、city.point が無ければ point を落とす', () => {
    const r = dropFabricatedMachiAza(
      nr(
        '宮城県塩竈市',
        { city: '塩竈市' },
        { oaza_cho: '字町' },
        { lat: 38.5, lng: 141.5, level: 3 },
      ),
    )
    expect(r.point).toBeUndefined()
  })

  it('落とさないとき、point は元のまま変わらない', () => {
    const original = { lat: 38.5, lng: 141.5, level: 3 }
    const r = dropFabricatedMachiAza(
      nr(
        '宮城県塩竈市字町1-2',
        { city: '塩竈市', point: [141.0, 38.0] },
        { oaza_cho: '字町' },
        original,
      ),
    )
    expect(r.point).toEqual(original)
  })

  // 施設名に自治体名が再出現すると、単一の出現に絞る限り必ずどこかで誤爆する
  // （末尾から探す・先頭から探す・都道府県名を錨にする、いずれも失敗した経緯は
  // dropFabricatedMachiAza のコメントにある）。全出現を走査し、どれか1つでも
  // 直後に町字名が続けば落とさない（残す側に倒す）ことで、施設名の位置や
  // 都道府県名の有無に関わらず見誤らなくなる
  it('施設名に自治体名が再出現しても、市区町村の位置を見誤らない', () => {
    // 施設名が後ろにある形。indexOf（先頭からの最初の出現）なら正しく動くが、
    // lastIndexOf（末尾からの最初の出現）だと施設名側の「七戸町」に釣られる
    expect(dropped(nr('青森県七戸町字町1-2七戸町役場', { city: '七戸町' }, { oaza_cho: '字町' })))
      .toBe(false)
    expect(dropped(nr('青森県上北郡七戸町字町1-2七戸町役場', { county: '上北郡', city: '七戸町' }, { oaza_cho: '字町' })))
      .toBe(false)

    // 施設名が前にある形。indexOf だけだと施設名側の「七戸町」に釣られて
    // 落としてしまうが、施設名の後ろにある本来の出現も試すので落とさない
    expect(dropped(nr('七戸町役場 青森県七戸町字町1-2', { city: '七戸町' }, { oaza_cho: '字町' })))
      .toBe(false)
    expect(dropped(nr('塩竈市役所 宮城県塩竈市字町1-2', { city: '塩竈市' }, { oaza_cho: '字町' })))
      .toBe(false)
  })

  // 都道府県名を錨にする案（3回目の失敗）が抜け落とす2例。
  // どちらも「本来の出現」の直後を全出現走査が拾うので落とさない
  it('都道府県名が入力に無くても、施設名の位置に関わらず見誤らない', () => {
    // 入力に都道府県名が無いので、都道府県名を錨にする案では錨が立たず、
    // 先頭の施設名側の「七戸町」に誤爆していた
    expect(dropped(nr('七戸町役場 七戸町字町1-2', { city: '七戸町' }, { oaza_cho: '字町' })))
      .toBe(false)
  })

  it('都道府県名が施設名にも出ても、そちらを錨にしない', () => {
    // 都道府県名を錨にする案では、施設名側にも都道府県名があると
    // 錨自体が施設名の内側に落ちていた
    expect(dropped(nr('青森県七戸町役場 青森県七戸町字町1-2', { city: '七戸町' }, { oaza_cho: '字町' })))
      .toBe(false)
  })
})
