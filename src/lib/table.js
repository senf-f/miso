// League table rules (spec §5). Shared by the scraper's checks and the phase 2 UI.

/** @typedef {{ club: string, played: number, won: number, drawn: number, lost: number,
 *              gf: number, ga: number, gd: number, points: number }} TableRow */

const STATS = ['played', 'won', 'drawn', 'lost', 'gf', 'ga']

/**
 * Table after round n: all played matches with round ≤ n. Postponed matches stay in
 * their original round. Every club that appears in `matches` is included.
 * @param {import('../../scraper/parse.js').Match[]} matches
 * @returns {TableRow[]}
 */
export function tableAfterRound(matches, n) {
  const rows = new Map()
  const row = club => {
    if (!rows.has(club)) rows.set(club, { club, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 })
    return rows.get(club)
  }
  for (const m of matches) {
    const home = row(m.home), away = row(m.away)
    if (m.round > n || m.homeGoals === null || m.awayGoals === null) continue
    record(home, m.homeGoals, m.awayGoals)
    record(away, m.awayGoals, m.homeGoals)
  }
  return [...rows.values()].sort((a, b) =>
    b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.club.localeCompare(b.club, 'hr'))
}

function record(r, scored, conceded) {
  r.played++
  r.gf += scored
  r.ga += conceded
  r.gd = r.gf - r.ga
  if (scored > conceded) { r.won++; r.points += 3 }
  else if (scored === conceded) { r.drawn++; r.points += 1 }
  else r.lost++
}

/**
 * Compare per-club played/W/D/L/GF/GA. Ignores order and points (spec §8).
 * @returns {string[]} one message per mismatching or missing club
 */
export function compareTables(computed, official) {
  const diffs = []
  const ours = new Map(computed.map(r => [r.club, r]))
  const theirs = new Map(official.map(r => [r.club, r]))
  for (const [club, o] of theirs) {
    const c = ours.get(club)
    if (!c) { diffs.push(`${club}: missing from computed table`); continue }
    for (const k of STATS)
      if (c[k] !== o[k]) diffs.push(`${club}: ${k} computed ${c[k]}, official ${o[k]}`)
  }
  for (const club of ours.keys())
    if (!theirs.has(club)) diffs.push(`${club}: missing from official table`)
  return diffs
}

/** True when the official points don't equal 3×won + drawn (a points deduction). */
export function hasDeduction(row) {
  return row.points !== 3 * row.won + row.drawn
}
