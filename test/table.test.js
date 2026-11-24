import { test, expect } from 'vitest'
import { tableAfterRound, compareTables, hasDeduction } from '../src/lib/table.js'
import { parseSeasonPage } from '../scraper/parse.js'
import { fixture } from './helpers.js'

const m = (round, home, hg, ag, away) => ({ round, date: null, home, away, homeGoals: hg, awayGoals: ag })

test('points, goal difference and stats per club', () => {
  const t = tableAfterRound([m(1, 'A', 2, 0, 'B'), m(1, 'C', 1, 1, 'D')], 1)
  const a = t.find(r => r.club === 'A')
  expect(a).toEqual({ club: 'A', played: 1, won: 1, drawn: 0, lost: 0, gf: 2, ga: 0, gd: 2, points: 3 })
  expect(t.find(r => r.club === 'B')).toMatchObject({ lost: 1, gd: -2, points: 0 })
  expect(t.find(r => r.club === 'D')).toMatchObject({ drawn: 1, points: 1 })
})

test('sort: points, then goal difference, then goals for, then name', () => {
  const ms = [
    m(1, 'ZED', 3, 1, 'X1'), // ZED: 3 pts, gd +2, gf 3
    m(1, 'BBB', 2, 0, 'X2'), // BBB: 3 pts, gd +2, gf 2
    m(1, 'AAA', 2, 0, 'X3'), // AAA: same as BBB → name
    m(1, 'TOP', 5, 0, 'X4'), // TOP: 3 pts, gd +5
  ]
  expect(tableAfterRound(ms, 1).slice(0, 4).map(r => r.club)).toEqual(['TOP', 'ZED', 'AAA', 'BBB'])
})

test('name tie-break uses Croatian collation', () => {
  const t = tableAfterRound([m(1, 'ŠIBENIK', 0, 0, 'SLAVEN'), m(1, 'ZADAR', 0, 0, 'RIJEKA')], 1)
  expect(t.map(r => r.club)).toEqual(['RIJEKA', 'SLAVEN', 'ŠIBENIK', 'ZADAR'])
})

test('round 0: every club present with zero played', () => {
  const t = tableAfterRound([m(1, 'A', 2, 0, 'B')], 0)
  expect(t).toHaveLength(2)
  expect(t.every(r => r.played === 0 && r.points === 0)).toBe(true)
})

test('only rounds ≤ N are counted', () => {
  const t = tableAfterRound([m(1, 'A', 1, 0, 'B'), m(2, 'B', 1, 0, 'A')], 1)
  expect(t.find(r => r.club === 'A').played).toBe(1)
})

test('postponed match counts in its original round only once played', () => {
  const ms = [m(1, 'RIJEKA', null, null, 'DINAMO')]
  for (let r = 2; r <= 14; r++) ms.push(m(r, 'DINAMO', 1, 0, `X${r}`))
  expect(tableAfterRound(ms, 14).find(r => r.club === 'DINAMO').played).toBe(13)
  ms[0] = m(1, 'RIJEKA', 0, 2, 'DINAMO')
  expect(tableAfterRound(ms, 14).find(r => r.club === 'DINAMO').played).toBe(14)
  expect(tableAfterRound(ms, 1).find(r => r.club === 'DINAMO')).toMatchObject({ played: 1, points: 3 })
})

test('golden: computed 2024/25 final table matches official', () => {
  const { matches, officialTable } = parseSeasonPage(fixture('archive-sid34.html'))
  expect(compareTables(tableAfterRound(matches, 36), officialTable)).toEqual([])
})

test('compareTables reports a wrong stat and a missing club', () => {
  const computed = tableAfterRound([m(1, 'A', 2, 0, 'B')], 1)
  const official = [
    { pos: 1, club: 'A', played: 1, won: 1, drawn: 0, lost: 0, gf: 3, ga: 0, points: 3 },
    { pos: 2, club: 'C', played: 1, won: 0, drawn: 0, lost: 1, gf: 0, ga: 2, points: 0 },
  ]
  const diffs = compareTables(computed, official)
  expect(diffs.some(d => d.includes('A') && d.includes('gf'))).toBe(true)
  expect(diffs.some(d => d.includes('B'))).toBe(true)
  expect(diffs.some(d => d.includes('C'))).toBe(true)
})

test('hasDeduction', () => {
  expect(hasDeduction({ won: 10, drawn: 5, points: 33 })).toBe(true)
  expect(hasDeduction({ won: 10, drawn: 5, points: 35 })).toBe(false)
})
