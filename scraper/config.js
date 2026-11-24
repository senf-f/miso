// Where the data comes from. Past seasons live on the hnl.hr archive (sid=N);
// the current season is on the live schedule page, which has no season label.

export const DELAY_MS = 1000

const FIRST_SID = 23 // 2013-14
const LAST_SID = 35 // 2025-26

/** @type {{season: string, sid: number}[]} */
export const SEASONS = Array.from({ length: LAST_SID - FIRST_SID + 1 }, (_, i) => {
  const start = 2013 + i
  return { season: seasonId(start), sid: FIRST_SID + i }
})

export const CURRENT = {
  season: '2026-27',
  url: 'https://hnl.hr/supersport-hnl/raspored-i-rezultati/',
}

export const STANDINGS_URL = 'https://hnl.hr/supersport-hnl/ljestvica/'

export function archiveUrl(sid) {
  return `https://hnl.hr/povijest/rezultati-i-poretci/?sid=${sid}`
}

function seasonId(startYear) {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}
