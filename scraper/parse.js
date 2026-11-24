// hnl.hr HTML → data.
//
// Selectors (from saved pages, 2026-11-24):
// - Matches: `table.raspored.utakmice`. A `tr.th` row holds `<th>N. kolo</th>`;
//   each following row is: date (+ optional venue divs) | home | hg | " : " | ag | away | link.
//   Unplayed matches have empty score cells.
// - Official final table (archive pages) and the standings page: `table.table1` that is
//   NOT `.raspored`. Columns: # | Klub | Uk | Pob | Ner | Por | G+ | G- | GR | Bod.
// - Sidebar widget: `table.col1Ljestvica`, present on every page. Never read it.
import * as cheerio from 'cheerio'

/** @typedef {{ round: number, date: string|null, home: string, away: string,
 *              homeGoals: number|null, awayGoals: number|null }} Match */
/** @typedef {{ pos: number, club: string, played: number, won: number, drawn: number,
 *              lost: number, gf: number, ga: number, points: number }} OfficialRow */

// hnl.hr spells some clubs differently between seasons, rows and tables.
const ALIASES = {
  'HRV. DRAGOVOLJAC': 'HRVATSKI DRAGOVOLJAC',
  'SL. BELUPO': 'SLAVEN BELUPO',
  'ISTRA': 'ISTRA 1961',
}

export function normalizeClub(name) {
  const n = name
    .replace(/ /g, ' ')
    .replace(/\(\s*-\d+\s*\)/g, '') // official-table deduction marker, e.g. "HAJDUK (-3)"
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
  return ALIASES[n] ?? n
}

/** @returns {{ matches: Match[], officialTable: OfficialRow[]|null }} */
export function parseSeasonPage(html) {
  const $ = cheerio.load(html)
  const matches = []
  let round = null
  $('table.raspored.utakmice tr').each((_, tr) => {
    const th = $(tr).find('th')
    if (th.length) {
      const m = th.first().text().match(/(\d+)\.\s*kolo/)
      round = m ? Number(m[1]) : null
      return
    }
    const td = $(tr).children('td')
    if (round === null || td.length < 6) return
    matches.push({
      round,
      date: firstText($, td.eq(0)) || null,
      home: normalizeClub(td.eq(1).text()),
      away: normalizeClub(td.eq(5).text()),
      homeGoals: score(td.eq(2).text()),
      awayGoals: score(td.eq(4).text()),
    })
  })
  const table = standingsTable($)
  return { matches: dropAbandoned(matches), officialTable: table.length ? table : null }
}

// An abandoned match and its replay are both listed in the same round; rows are in
// date order, so the last row for a fixture is the result that counts.
function dropAbandoned(matches) {
  const last = new Map()
  matches.forEach((m, i) => last.set(`${m.round}|${m.home}|${m.away}`, i))
  return matches.filter((m, i) => last.get(`${m.round}|${m.home}|${m.away}`) === i)
}

/** @returns {OfficialRow[]} */
export function parseStandingsPage(html) {
  return standingsTable(cheerio.load(html))
}

function standingsTable($) {
  const rows = []
  $('table.table1').not('.raspored').first().find('tr').each((_, tr) => {
    const c = $(tr).children('td').map((_, td) => $(td).text()).get()
    if (c.length < 10) return
    rows.push({
      pos: parseInt(c[0], 10),
      club: normalizeClub(c[1]),
      played: Number(c[2]),
      won: Number(c[3]),
      drawn: Number(c[4]),
      lost: Number(c[5]),
      gf: Number(c[6]),
      ga: Number(c[7]),
      points: Number(c[9]),
    })
  })
  return rows
}

function firstText($, cell) {
  return cell.contents().filter((_, n) => n.type === 'text').first().text().trim()
}

function score(text) {
  const t = text.trim()
  if (t === '') return null
  return /^\d+$/.test(t) ? Number(t) : NaN
}
