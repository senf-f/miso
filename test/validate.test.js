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
