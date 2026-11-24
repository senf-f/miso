import { test, expect, beforeEach } from 'vitest'
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scrapeAll } from '../scraper/run.js'
import { archiveUrl, CURRENT, STANDINGS_URL } from '../scraper/config.js'
import { fixture } from './helpers.js'

const SEASONS = [{ season: '2023-24', sid: 33 }, { season: '2024-25', sid: 34 }]
let outDir, sleeps, logs

beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'hnl-'))
  sleeps = []
  logs = []
})

const log = { log: s => logs.push(s), warn: s => logs.push(s), error: s => logs.push(s) }
const sleep = async ms => { sleeps.push(ms) }

function fakeFetch(pages) {
  const calls = []
  const fn = async url => {
    calls.push(url)
    const page = pages[url]
    if (page instanceof Error) throw page
    if (page === undefined) return { ok: false, status: 404, text: async () => '' }
    return { ok: true, status: 200, text: async () => page }
  }
  fn.calls = calls
  return fn
}

// The 2024-25 page re-dated to 2023-24, so it passes the season date check.
const asSeason2023 = html => html.replace(/\.2024\./g, '.2023.').replace(/\.2025\./g, '.2024.')

function pages(overrides = {}) {
  return {
    [archiveUrl(33)]: asSeason2023(fixture('archive-sid34.html')),
    [archiveUrl(34)]: fixture('archive-sid34.html'),
    [CURRENT.url]: fixture('current.html'),
    [STANDINGS_URL]: fixture('ljestvica.html'),
    ...overrides,
  }
}

const run = fetchImpl => scrapeAll({ fetchImpl, sleep, outDir, log, seasons: SEASONS })
const readJson = async name => JSON.parse(await readFile(join(outDir, name), 'utf8'))

test('happy path writes season files and index, all ok', async () => {
  const fetchImpl = fakeFetch(pages())
  expect(await run(fetchImpl)).toEqual({ exitCode: 0 })

  const s = await readJson('2024-25.json')
  expect(s).toMatchObject({ season: '2024-25', sid: 34, source: archiveUrl(34) })
  expect(s.matches).toHaveLength(180)
  expect(s.officialTable).toHaveLength(10)
  expect(typeof s.scrapedAt).toBe('string')

  const cur = await readJson('2026-27.json')
  expect(cur).toMatchObject({ season: '2026-27', sid: null, officialTable: null })

  const index = await readJson('index.json')
  expect(index.current).toBe('2026-27')
  expect(index.seasons).toEqual([
    { season: '2023-24', status: 'ok', file: '2023-24.json' },
    { season: '2024-25', status: 'ok', file: '2024-25.json' },
    { season: '2026-27', status: 'ok', file: '2026-27.json' },
  ])
  expect(fetchImpl.calls).toEqual([archiveUrl(33), archiveUrl(34), CURRENT.url, STANDINGS_URL])
  expect(sleeps.filter(ms => ms === 1000)).toHaveLength(3)
})

test('empty season with no existing file → unavailable, exit 0', async () => {
  expect(await run(fakeFetch(pages({ [archiveUrl(33)]: fixture('archive-empty.html') })))).toEqual({ exitCode: 0 })
  const index = await readJson('index.json')
  expect(index.seasons[0]).toEqual({ season: '2023-24', status: 'unavailable', file: null })
  await expect(readFile(join(outDir, '2023-24.json'))).rejects.toThrow()
})

test('empty page does not replace an existing good file', async () => {
  await writeFile(join(outDir, '2023-24.json'), 'GOOD')
  await run(fakeFetch(pages({ [archiveUrl(33)]: fixture('archive-empty.html') })))
  expect(await readFile(join(outDir, '2023-24.json'), 'utf8')).toBe('GOOD')
  expect((await readJson('index.json')).seasons[0]).toEqual({ season: '2023-24', status: 'ok', file: '2023-24.json' })
})

test('invalid season keeps the existing file and exits 1', async () => {
  await writeFile(join(outDir, '2023-24.json'), 'GOOD')
  const broken = asSeason2023(fixture('archive-sid34.html')).replace(/<tr><td>02\.08\.2023\.[\s\S]*?<\/tr>/, '')
  expect(await run(fakeFetch(pages({ [archiveUrl(33)]: broken })))).toEqual({ exitCode: 1 })
  expect(await readFile(join(outDir, '2023-24.json'), 'utf8')).toBe('GOOD')
  expect(logs.join('\n')).toMatch(/round 1/)
})

test('fetch failing 3 times → 3 attempts, exit 1, other seasons still written', async () => {
  const fetchImpl = fakeFetch(pages({ [archiveUrl(33)]: new Error('ECONNRESET') }))
  expect(await run(fetchImpl)).toEqual({ exitCode: 1 })
  expect(fetchImpl.calls.filter(u => u === archiveUrl(33))).toHaveLength(3)
  expect(sleeps).toEqual(expect.arrayContaining([2000, 4000]))
  await readJson('2024-25.json')
  expect((await readJson('index.json')).seasons[0].status).toBe('unavailable')
})

test('HTTP error status is retried like a network error', async () => {
  const fetchImpl = fakeFetch(pages({ [archiveUrl(33)]: undefined }))
  expect(await run(fetchImpl)).toEqual({ exitCode: 1 })
  expect(fetchImpl.calls.filter(u => u === archiveUrl(33))).toHaveLength(3)
})

test('standings cross-check mismatch only warns', async () => {
  const fetchImpl = fakeFetch(pages({ [STANDINGS_URL]: fixture('archive-sid34.html') }))
  expect(await run(fetchImpl)).toEqual({ exitCode: 0 })
  expect(logs.join('\n')).toMatch(/ljestvica/i)
})

test('no .tmp files left behind', async () => {
  await run(fakeFetch(pages()))
  expect((await readdir(outDir)).filter(f => f.endsWith('.tmp'))).toEqual([])
})

test('season rollover: current page showing another season does not overwrite the file', async () => {
  await writeFile(join(outDir, '2026-27.json'), 'GOOD')
  const fetchImpl = fakeFetch(pages({ [CURRENT.url]: fixture('archive-sid34.html') })) // 2024-25 dates
  expect(await run(fetchImpl)).toEqual({ exitCode: 1 })
  expect(await readFile(join(outDir, '2026-27.json'), 'utf8')).toBe('GOOD')
  expect(logs.join('\n')).toMatch(/outside season 2026-27/)
})
