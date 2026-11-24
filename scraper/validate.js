const ROUNDS = 36
const PER_ROUND = 5

/**
 * @param {import('./parse.js').Match[]} matches
 * @param {{ allowUnplayed: boolean }} opts
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateSeason(matches, { allowUnplayed }) {
  const errors = []
  const perRound = new Map()
  for (const m of matches) perRound.set(m.round, (perRound.get(m.round) ?? 0) + 1)

  if (perRound.size !== ROUNDS) errors.push(`expected ${ROUNDS} rounds, found ${perRound.size}`)
  for (const [round, n] of perRound)
    if (n !== PER_ROUND) errors.push(`round ${round}: expected ${PER_ROUND} matches, found ${n}`)

  for (const m of matches) {
    const label = `round ${m.round}: ${m.home}–${m.away}`
    const h = m.homeGoals, a = m.awayGoals
    if (h === null && a === null) {
      if (!allowUnplayed) errors.push(`${label}: no score`)
    } else if (!Number.isInteger(h) || !Number.isInteger(a)) {
      errors.push(`${label}: bad score ${h}:${a}`)
    }
  }
  return { ok: errors.length === 0, errors }
}
