import { test, expect } from 'vitest'
import { parseSeasonPage, parseStandingsPage, normalizeClub } from '../scraper/parse.js'
import { fixture } from './helpers.js'

test('normalizeClub unifies spelling variants', () => {
  expect(normalizeClub('  Dinamo ')).toBe('DINAMO')
  expect(normalizeClub('Istra  1961')).toBe('ISTRA 1961')
})

test('sid34: 180 matches across rounds 1..36, all played', () => {
  const { matches } = parseSeasonPage(fixture('archive-sid34.html'))
  expect(matches).toHaveLength(180)
  expect(new Set(matches.map(m => m.round)).size).toBe(36)
  expect(matches.every(m => Number.isInteger(m.homeGoals) && Number.isInteger(m.awayGoals))).toBe(true)
  expect(matches[0]).toEqual({
    round: 1, date: '02.08.2024. 21:00', home: 'DINAMO', away: 'ISTRA 1961', homeGoals: 5, awayGoals: 0,
  })
})

test('sid34: official table is the season table, not the sidebar', () => {
  const { officialTable } = parseSeasonPage(fixture('archive-sid34.html'))
  expect(officialTable).toHaveLength(10)
  expect(officialTable.every(r => r.played === 36)).toBe(true)
  expect(officialTable[0]).toMatchObject({ pos: 1, club: 'RIJEKA', won: 18, drawn: 11, lost: 7, gf: 49, ga: 21, points: 65 })
  expect(officialTable.map(r => r.club)).not.toContain('RUDEŠ')
})

test('current: 180 fixtures, postponed Rijeka–Dinamo in round 2 unplayed', () => {
  const { matches, officialTable } = parseSeasonPage(fixture('current.html'))
  expect(matches).toHaveLength(180)
  const m = matches.find(m => m.round === 2 && m.home === 'RIJEKA' && m.away === 'DINAMO')
  expect(m).toMatchObject({ homeGoals: null, awayGoals: null })
  expect(officialTable).toBeNull()
})

test('current: date cell keeps only the date, not venue/competition', () => {
  const { matches } = parseSeasonPage(fixture('current.html'))
  const m = matches.find(m => m.round === 15)
  expect(m.date).toBe('27.11.2026. 18:00')
})

test('non-numeric score text becomes NaN, empty becomes null', () => {
  const html = `<table class="table1 raspored utakmice"><tr class="th"><th>1. kolo</th></tr>
    <tr><td>01.08.2025.</td><td>A</td><td>p.f.</td><td> : </td><td></td><td>B</td></tr></table>`
  const [m] = parseSeasonPage(html).matches
  expect(m.homeGoals).toBeNaN()
  expect(m.awayGoals).toBeNull()
})

test('empty archive page → no matches, no table', () => {
  expect(parseSeasonPage(fixture('archive-empty.html'))).toEqual({ matches: [], officialTable: null })
})

test('ljestvica → 10 rows, normalized clubs', () => {
  const rows = parseStandingsPage(fixture('ljestvica.html'))
  expect(rows).toHaveLength(10)
  expect(rows[0]).toMatchObject({ pos: 1, club: 'HAJDUK', played: 14, won: 10, drawn: 2, lost: 2, gf: 29, ga: 12, points: 32 })
})

test('normalizeClub resolves hnl.hr abbreviations and deduction markers', () => {
  expect(normalizeClub('Hrv. Dragovoljac')).toBe('HRVATSKI DRAGOVOLJAC')
  expect(normalizeClub('Sl. Belupo')).toBe('SLAVEN BELUPO')
  expect(normalizeClub('Istra')).toBe('ISTRA 1961')
  expect(normalizeClub(' HAJDUK (-3) ')).toBe('HAJDUK')
})

test('abandoned match replayed in the same round: only the later (replay) row is kept', () => {
  const row = (d, h, hg, ag, a) => `<tr><td>${d}</td><td>${h}</td><td>${hg}</td><td> : </td><td>${ag}</td><td>${a}</td></tr>`
  const html = `<table class="table1 raspored utakmice"><tr class="th"><th>20. kolo</th></tr>
    ${row('15.12.2017. 18:00', 'Slaven Belupo', 0, 0, 'Lokomotiva')}
    ${row('16.12.2017. 15:00', 'Dinamo', 1, 0, 'Cibalia')}
    ${row('18.12.2017. 14:00', 'Slaven Belupo', 2, 2, 'Lokomotiva')}</table>`
  const { matches } = parseSeasonPage(html)
  expect(matches).toHaveLength(2)
  expect(matches.find(m => m.home === 'SLAVEN BELUPO')).toMatchObject({ date: '18.12.2017. 14:00', homeGoals: 2, awayGoals: 2 })
})
