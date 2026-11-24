import { test, expect } from 'vitest'
import { validateSeason } from '../scraper/validate.js'
import { parseSeasonPage } from '../scraper/parse.js'
import { fixture } from './helpers.js'

function fullSeason() {
  const out = []
  for (let round = 1; round <= 36; round++)
    for (let i = 0; i < 5; i++)
      out.push({ round, date: null, home: `H${i}`, away: `A${i}`, homeGoals: 1, awayGoals: 0 })
  return out
}
const past = { allowUnplayed: false }
const current = { allowUnplayed: true }

test('full played season is valid', () => {
  expect(validateSeason(fullSeason(), past)).toEqual({ ok: true, errors: [] })
})

test('35 rounds is invalid and says 36', () => {
  const r = validateSeason(fullSeason().filter(m => m.round !== 36), past)
  expect(r.ok).toBe(false)
  expect(r.errors.join(' ')).toMatch(/36/)
})

test('a round with 4 matches is invalid and names the round', () => {
  const ms = fullSeason()
  ms.splice(ms.findIndex(m => m.round === 7), 1)
  const r = validateSeason(ms, past)
  expect(r.ok).toBe(false)
  expect(r.errors.join(' ')).toMatch(/7/)
})

test('non-numeric score (NaN) is invalid', () => {
  const ms = fullSeason()
  ms[3].homeGoals = NaN
  expect(validateSeason(ms, past).ok).toBe(false)
  expect(validateSeason(ms, current).ok).toBe(false)
})

test('half a score is invalid in both modes', () => {
  const ms = fullSeason()
  ms[3].awayGoals = null
  expect(validateSeason(ms, past).ok).toBe(false)
  expect(validateSeason(ms, current).ok).toBe(false)
})

test('unplayed match: invalid for past season, valid for current', () => {
  const ms = fullSeason()
  ms[3].homeGoals = null
  ms[3].awayGoals = null
  expect(validateSeason(ms, past).ok).toBe(false)
  expect(validateSeason(ms, current).ok).toBe(true)
})

test('real fixtures validate', () => {
  expect(validateSeason(parseSeasonPage(fixture('archive-sid34.html')).matches, past).ok).toBe(true)
  expect(validateSeason(parseSeasonPage(fixture('current.html')).matches, current).ok).toBe(true)
})

// Realistic season: 10 clubs, double round-robin twice (each club once per round),
// dates inside 2024-25.
function realisticSeason() {
  const clubs = Array.from({ length: 10 }, (_, i) => `C${i}`)
  const rot = clubs.slice(1)
  const half = []
  for (let r = 0; r < 9; r++) {
    const ring = [clubs[0], ...rot.slice(r), ...rot.slice(0, r)]
    const pairs = []
    for (let i = 0; i < 5; i++) pairs.push([ring[i], ring[9 - i]])
    half.push(pairs)
  }
  const rounds = [...half, ...half.map(ps => ps.map(([h, a]) => [a, h]))]
  const all = [...rounds, ...rounds]
  return all.flatMap((pairs, i) => pairs.map(([home, away]) => ({
    round: i + 1, date: '15.10.2024. 18:00',
    home, away, homeGoals: 1, awayGoals: 1,
  })))
}
const opts = { allowUnplayed: false, season: '2024-25' }

test('realistic season passes structural checks', () => {
  expect(validateSeason(realisticSeason(), opts)).toEqual({ ok: true, errors: [] })
})

test('a club spelled two ways (11 clubs) is invalid', () => {
  const ms = realisticSeason()
  ms.filter(m => m.home === 'C3').slice(0, 3).forEach(m => { m.home = 'C3 VARIANT' })
  const r = validateSeason(ms, opts)
  expect(r.ok).toBe(false)
  expect(r.errors.join(' ')).toMatch(/11 clubs/)
})

test('a club playing twice in one round is invalid', () => {
  const ms = realisticSeason()
  const r1 = ms.filter(m => m.round === 1)
  r1[1].home = r1[0].home
  expect(validateSeason(ms, opts).ok).toBe(false)
})

test('rounds must be exactly 1..36', () => {
  const ms = realisticSeason().map(m => ({ ...m, round: m.round === 36 ? 37 : m.round }))
  const r = validateSeason(ms, opts)
  expect(r.ok).toBe(false)
  expect(r.errors.join(' ')).toMatch(/37/)
})

test('dates outside the season (rollover to next season) are invalid', () => {
  const ms = realisticSeason().map(m => ({ ...m, date: '15.10.2025. 18:00', homeGoals: null, awayGoals: null }))
  const r = validateSeason(ms, { ...opts, allowUnplayed: true })
  expect(r.ok).toBe(false)
  expect(r.errors.join(' ')).toMatch(/2024-25/)
})
