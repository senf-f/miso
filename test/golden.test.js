// Every scraped past season: our computed final table must match hnl.hr's official one
// (per-club played/W/D/L/GF/GA). Runs over public/data, so run `npm run scrape` first.
import { test, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { tableAfterRound, compareTables, hasDeduction } from '../src/lib/table.js'

const dir = new URL('../public/data/', import.meta.url)
const indexUrl = new URL('index.json', dir)
const hasData = existsSync(indexUrl)
const seasons = hasData
  ? JSON.parse(readFileSync(indexUrl, 'utf8')).seasons
      .filter(s => s.status === 'ok')
      .map(s => JSON.parse(readFileSync(new URL(s.file, dir), 'utf8')))
      .filter(s => s.officialTable)
  : []

test.skipIf(!hasData)('scraped data exists (run `npm run scrape`)', () => {
  expect(seasons.length).toBeGreaterThan(0)
})

for (const s of seasons) {
  test(`golden ${s.season}: computed final table matches official`, () => {
    for (const r of s.officialTable.filter(hasDeduction))
      console.log(`${s.season}: ${r.club} points deduction (${3 * r.won + r.drawn} → ${r.points})`)
    expect(compareTables(tableAfterRound(s.matches, 36), s.officialTable)).toEqual([])
  })
}
