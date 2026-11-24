const ROUNDS = 36
const PER_ROUND = 5
const CLUBS = 10

/**
 * @param {import('./parse.js').Match[]} matches
 * @param {{ allowUnplayed: boolean, season?: string }} opts  season like '2024-25';
 *   when given, every dated match must fall between 1 June of the start year and
 *   31 August of the end year (catches a season rollover or a wrong sid).
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateSeason(matches, { allowUnplayed, season }) {
  const errors = []

  // Rounds: exactly 1..36, 5 matches each, every club once per round.
  const byRound = new Map()
  for (const m of matches) {
    if (!byRound.has(m.round)) byRound.set(m.round, [])
    byRound.get(m.round).push(m)
  }
  if (byRound.size !== ROUNDS) errors.push(`expected ${ROUNDS} rounds, found ${byRound.size}`)
  for (const [round, ms] of byRound) {
    if (!Number.isInteger(round) || round < 1 || round > ROUNDS) errors.push(`unexpected round ${round}`)
    if (ms.length !== PER_ROUND) errors.push(`round ${round}: expected ${PER_ROUND} matches, found ${ms.length}`)
    const seen = new Set()
    for (const club of ms.flatMap(m => [m.home, m.away])) {
      if (seen.has(club)) errors.push(`round ${round}: ${club} plays more than once`)
      seen.add(club)
    }
  }

  // Clubs: a spelling variant shows up as an 11th club.
  const clubs = new Set(matches.flatMap(m => [m.home, m.away]))
  if (clubs.size !== CLUBS) errors.push(`expected ${CLUBS} clubs, found ${clubs.size} clubs: ${[...clubs].sort().join(', ')}`)

  // Scores.
  for (const m of matches) {
    const label = `round ${m.round}: ${m.home}–${m.away}`
    const h = m.homeGoals, a = m.awayGoals
    if (h === null && a === null) {
      if (!allowUnplayed) errors.push(`${label}: no score`)
    } else if (!Number.isInteger(h) || !Number.isInteger(a)) {
      errors.push(`${label}: bad score ${h}:${a}`)
    }
  }

  // Dates belong to the season.
  if (season) {
    const start = Number(season.slice(0, 4))
    const from = new Date(Date.UTC(start, 5, 1))
    const to = new Date(Date.UTC(start + 1, 7, 31, 23, 59))
    const outside = matches.filter(m => {
      const d = parseDate(m.date)
      return d && (d < from || d > to)
    })
    if (outside.length)
      errors.push(`${outside.length} matches dated outside season ${season} (first: ${outside[0].date})`)
  }

  return { ok: errors.length === 0, errors }
}

function parseDate(text) {
  const m = text?.match(/(\d{2})\.(\d{2})\.(\d{4})/)
  return m ? new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))) : null
}
