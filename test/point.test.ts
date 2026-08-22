import { describe, expect, it } from 'vitest'
import { isPointEmittable } from '../src/point.ts'

describe('isPointEmittable', () => {
  it('座標が無ければ false', () => {
    expect(isPointEmittable(undefined, {})).toBe(false)
  })

  it('level 8 以外は常に出す', () => {
    expect(isPointEmittable({ level: 2 }, {})).toBe(true)
    expect(isPointEmittable({ level: 3 }, {})).toBe(true)
    expect(isPointEmittable({ level: 3 }, { chiban: {} })).toBe(true)
  })

  it('rsdt に裏付けられた level 8 は出す', () => {
    expect(isPointEmittable({ level: 8 }, { rsdt: {} })).toBe(true)
  })

  it('裏付けの無い level 8 は出さない', () => {
    expect(isPointEmittable({ level: 8 }, {})).toBe(false)
  })

  it('chiban があれば rsdt があっても level 8 を出さない', () => {
    expect(isPointEmittable({ level: 8 }, { rsdt: {}, chiban: {} })).toBe(false)
  })
})
