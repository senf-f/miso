// `npm run scrape`: fetch every season from hnl.hr and write public/data/*.json.
import { writeFile, rename, mkdir, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SEASONS, CURRENT, STANDINGS_URL, DELAY_MS, archiveUrl } from './config.js'
import { parseSeasonPage, parseStandingsPage } from './parse.js'
import { validateSeason } from './validate.js'
import { tableAfterRound, compareTables, hasDeduction } from '../src/lib/table.js'

const BACKOFF_MS = [2000, 4000]

/**
 * @returns {Promise<{ exitCode: 0|1 }>}
 */
export async function scrapeAll({
  fetchImpl = fetch,
  sleep = ms => new Promise(r => setTimeout(r, ms)),
  outDir = 'public/data',
  log = console,
  seasons = SEASONS,
  current = CURRENT,
} = {}) {
  await mkdir(outDir, { recursive: true })
  let exitCode = 0
  let requests = 0

  async function get(url) {
    if (requests++ > 0) await sleep(DELAY_MS)
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetchImpl(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return await res.text()
      } catch (err) {
        if (attempt >= BACKOFF_MS.length) {
          log.warn(`${url}: giving up after ${attempt + 1} attempts (${err.message})`)
          return null
        }
        await sleep(BACKOFF_MS[attempt])
      }
    }
  }

  const jobs = [
    ...seasons.map(s => ({ season: s.season, sid: s.sid, url: archiveUrl(s.sid), isCurrent: false })),
    { season: current.season, sid: null, url: current.url, isCurrent: true },
  ]
  const index = []
  let currentMatches = null

  for (const job of jobs) {
    const file = `${job.season}.json`
    const path = join(outDir, file)
    const existing = await exists(path)
    const keep = () => index.push(existing
      ? { season: job.season, status: 'ok', file }
      : { season: job.season, status: 'unavailable', file: null })

    const html = await get(job.url)
    if (html === null) { exitCode = 1; keep(); continue }

    const { matches, officialTable } = parseSeasonPage(html)
    if (matches.length === 0) {
      log.warn(`${job.season}: no matches on hnl.hr yet${existing ? ', keeping existing file' : ''}`)
      keep()
      continue
    }

    const { ok, errors } = validateSeason(matches, { allowUnplayed: job.isCurrent })
    if (!ok) {
      log.error(`${job.season}: invalid data, ${existing ? 'keeping existing file' : 'nothing written'}`)
      for (const e of errors) log.error(`  ${e}`)
      exitCode = 1
      keep()
      continue
    }

    await writeJsonAtomic(path, {
      season: job.season,
      sid: job.sid,
      source: job.url,
      scrapedAt: new Date().toISOString(),
      matches,
      officialTable,
    })
    index.push({ season: job.season, status: 'ok', file })
    log.log(`${job.season}: ${matches.length} matches`)

    if (officialTable) {
      for (const r of officialTable.filter(hasDeduction))
        log.warn(`${job.season}: ${r.club} has a points deduction (official ${r.points}, from results ${3 * r.won + r.drawn})`)
      for (const d of compareTables(tableAfterRound(matches, 36), officialTable))
        log.warn(`${job.season}: ${d}`)
    }
    if (job.isCurrent) currentMatches = matches
  }

  if (currentMatches) {
    const html = await get(STANDINGS_URL)
    if (html !== null) {
      const diffs = compareTables(tableAfterRound(currentMatches, 36), parseStandingsPage(html))
      for (const d of diffs) log.warn(`ljestvica cross-check: ${d}`)
    }
  }

  await writeJsonAtomic(join(outDir, 'index.json'), {
    generatedAt: new Date().toISOString(),
    current: current.season,
    seasons: index,
  })
  return { exitCode }
}

async function writeJsonAtomic(path, data) {
  const tmp = `${path}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2) + '\n')
  await rename(tmp, path)
}

async function exists(path) {
  try { await access(path); return true } catch { return false }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { exitCode } = await scrapeAll()
  process.exit(exitCode)
}
