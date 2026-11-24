# HNL Rivalry: Phase 1 (Scraper) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run scrape` downloads every HNL season from 2013/14 to 2026/27 from hnl.hr and writes validated `public/data/<season>.json` files and an `index.json`. A test proves our computed final tables match the official ones.

**Architecture:** The pieces are pure modules: parse HTML → match list + official table, validate, compute the table after round N, compare tables. A thin orchestrator wraps them and takes injected `fetch`/`sleep` so it can be tested offline against saved HTML fixtures. The website (phase 2) only reads the JSON this phase produces.

**Tech Stack:** Node.js 26 (ESM, global `fetch`), cheerio, Vitest. No other runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-11-24-hnl-rivalry-design.md` (§2, §4, §5 table rules, §7 scraper, §8)

## Global Constraints

- No API key, no paid API. The only data source is hnl.hr HTML.
- Requests are sequential, with **1000 ms** between them. Never parallel.
- **Seasons:** sid=23 (2013-14) … sid=35 (2025-26) come from `https://hnl.hr/povijest/rezultati-i-poretci/?sid=N`. The current season, 2026-27, comes from `https://hnl.hr/supersport-hnl/raspored-i-rezultati/`. The cross-check table comes from `https://hnl.hr/supersport-hnl/ljestvica/`.
- **Season id format:** `YYYY-YY` (e.g. `2024-25`). This is also the file name and the URL-hash format used in phase 2.
- **Points:** win 3, draw 1. Deductions are ignored.
- **Sort:** points, then goal difference, then goals for, then club name.
- **Table after round N** = played matches with `round ≤ N`. Postponed matches stay in their original round.
- **Validation:** 36 rounds × 5 matches. Each score is two integers, or (current season only) both null.
- Never overwrite a good file with bad data. Write to `<file>.tmp`, then rename.
- **Ignore the sidebar "Ljestvica" widget** that appears on every hnl.hr page.
- **Out of scope for this phase:** Vite, UI, lock/mood logic, deploy.

## Review Focus

1. **Club names written differently** between match rows and the standings table (`DINAMO` vs `Dinamo`, trailing spaces, `&nbsp;`). Both should resolve to the same club. → `normalizeClub` test in Task 2.
2. **The sidebar widget mistaken for the season's final table.** The parsed official table for 2024/25 must be 10 rows, all with played=36. → Task 2 test.
3. **A score cell that isn't a number** (`-`, `p.f.`, a stray note) must give a validation error, not `NaN` points. → Task 3 test.
4. **hnl.hr returns 200 with an empty page for a season that has an existing good file.** The old file must be kept, and the season still marked `ok`. → Task 5 test.
5. **The postponed Rijeka–Dinamo round-1 match** (unplayed, dated 03.12.2026) must not count until it has a score. Once played, it counts in round 1. → Task 4 test.

---

## File Structure

```
package.json                 type: module; scripts: test, scrape, fixtures
.gitignore                   node_modules/, .superpowers/, *.tmp
scraper/config.js            season list + URLs + delay
scraper/parse.js             HTML → { matches, officialTable }, standings page → rows, normalizeClub
scraper/validate.js          validateSeason
scraper/run.js               scrapeAll orchestrator + CLI entry
scraper/capture-fixtures.js  one-off: saves hnl.hr pages into test/fixtures/
src/lib/table.js             tableAfterRound, compareTables  (shared with phase 2 UI)
test/fixtures/*.html         saved pages (committed)
test/*.test.js
public/data/                 output (committed after first real run)
```

Shared types (JSDoc in the file that produces them):

```js
// Match       { round: number, date: string|null, home: string, away: string,
//               homeGoals: number|null, awayGoals: number|null }
// TableRow    { club, played, won, drawn, lost, gf, ga, gd, points }   (computed)
// OfficialRow { pos, club, played, won, drawn, lost, gf, ga, points }  (from hnl.hr)
// SeasonFile  { season, sid|null, source, scrapedAt, matches: Match[],
//               officialTable: OfficialRow[]|null }
// IndexFile   { generatedAt, current: '2026-27',
//               seasons: [{ season, status: 'ok'|'unavailable', file|null }] }
```

---

### Task 1: Project setup + saved fixtures

**Files:**
- Create: `package.json`, `.gitignore`, `scraper/config.js`, `scraper/capture-fixtures.js`, `test/fixtures/` (4 files)

**Interfaces:**
- Produces: `SEASONS: {season: string, sid: number}[]` (2013-14/23 … 2025-26/35), `CURRENT: {season: '2026-27', url}`, `STANDINGS_URL`, `archiveUrl(sid) -> string`, `DELAY_MS = 1000` from `scraper/config.js`.
- Produces fixtures: `test/fixtures/archive-sid34.html`, `current.html`, `ljestvica.html`, and a hand-made `archive-empty.html` (a copy of sid34 with every match row and the final table removed, keeping header and sidebar).

- [ ] **Step 1:** `git init`. Write `.gitignore`. Run `npm init -y`, then set `"type": "module"` and add these scripts: `"test": "vitest run"`, `"scrape": "node scraper/run.js"`, `"fixtures": "node scraper/capture-fixtures.js"`. Run `npm i cheerio` and `npm i -D vitest`.
- [ ] **Step 2:** Write `scraper/config.js` with the values from Global Constraints.
- [ ] **Step 3:** Write `capture-fixtures.js`. It fetches sid=34, the current page and ljestvica sequentially, 1000 ms apart, and saves each into `test/fixtures/`. Run `npm run fixtures`.
  Expected: three files of more than 20 KB each. `grep -c "kolo" test/fixtures/archive-sid34.html` gives ≥ 36.
- [ ] **Step 4:** Create `archive-empty.html` by hand as described above. Open the fixtures and note the real selectors (round `<th>`, match row cells, final table, sidebar widget container) in a comment at the top of `scraper/parse.js` for Task 2.
- [ ] **Step 5:** Commit: `chore: project setup and hnl.hr fixtures`.

---

### Task 2: Parser

**Files:**
- Create: `scraper/parse.js`
- Test: `test/parse.test.js`

**Interfaces:**
- Consumes: the fixtures from Task 1.
- Produces:
  - `parseSeasonPage(html: string) -> { matches: Match[], officialTable: OfficialRow[]|null }`
  - `parseStandingsPage(html: string) -> OfficialRow[]` (for ljestvica)
  - `normalizeClub(name: string) -> string`: trims, turns `&nbsp;` into a space, collapses whitespace, uppercases. Every club name that leaves the parser goes through it.

- [ ] **Step 1: Write failing tests**

```js
test('normalizeClub unifies spelling variants', () => {
  expect(normalizeClub('  Dinamo ')).toBe('DINAMO')
  expect(normalizeClub('Istra  1961')).toBe('ISTRA 1961')
})
test('sid34: 180 matches across rounds 1..36, all played', () => {
  const { matches } = parseSeasonPage(fixture('archive-sid34.html'))
  expect(matches).toHaveLength(180)
  expect(new Set(matches.map(m => m.round)).size).toBe(36)
  expect(matches.every(m => Number.isInteger(m.homeGoals) && Number.isInteger(m.awayGoals))).toBe(true)
})
test('sid34: official table is the season table, not the sidebar', () => {
  const { officialTable } = parseSeasonPage(fixture('archive-sid34.html'))
  expect(officialTable).toHaveLength(10)
  expect(officialTable.every(r => r.played === 36)).toBe(true)
  expect(officialTable[0]).toMatchObject({ pos: 1, club: 'RIJEKA', won: 18, drawn: 11, lost: 7, gf: 49, ga: 21, points: 65 })
  expect(officialTable.map(r => r.club)).not.toContain('RUDEŠ')
})
test('current: 180 fixtures, postponed Rijeka–Dinamo in round 1 unplayed', () => {
  const { matches, officialTable } = parseSeasonPage(fixture('current.html'))
  expect(matches).toHaveLength(180)
  const m = matches.find(m => m.round === 1 && m.home === 'RIJEKA' && m.away === 'DINAMO')
  expect(m).toMatchObject({ homeGoals: null, awayGoals: null })
  expect(officialTable).toBeNull()
})
test('empty archive page → no matches, no table', () => {
  expect(parseSeasonPage(fixture('archive-empty.html'))).toEqual({ matches: [], officialTable: null })
})
test('ljestvica → 10 rows', () => {
  expect(parseStandingsPage(fixture('ljestvica.html'))).toHaveLength(10)
})
```

- [ ] **Step 2:** `npx vitest run test/parse.test.js` → FAIL (module missing).
- [ ] **Step 3:** Implement with cheerio, using the selectors noted in Task 1. Scope the final-table lookup to the main content, excluding the sidebar container. Non-numeric score text becomes `NaN` (not null) so validation can catch it. Only truly empty cells become `null`.
- [ ] **Step 4:** Re-run → PASS.
- [ ] **Step 5:** Commit: `feat: hnl.hr season and standings parser`.

---

### Task 3: Validation

**Files:**
- Create: `scraper/validate.js`
- Test: `test/validate.test.js`

**Interfaces:**
- Produces: `validateSeason(matches: Match[], { allowUnplayed: boolean }) -> { ok: boolean, errors: string[] }`. Each error is in Croatian or English and names the round/match.

- [ ] **Step 1: Write failing tests.** Use a helper `fullSeason()` that builds 36×5 played matches.
  - full season, `allowUnplayed:false` → `ok:true`
  - 35 rounds → `ok:false`, with an error mentioning `36`
  - one round with 4 matches → `ok:false`
  - `homeGoals: NaN` → `ok:false` (Review Focus 3)
  - `homeGoals: 2, awayGoals: null` → `ok:false` with both settings (half a score)
  - both null with `allowUnplayed:false` → `ok:false`; with `allowUnplayed:true` → `ok:true`
  - the sid34 and current fixtures run through `parseSeasonPage` → `ok:true` (current with `allowUnplayed:true`)
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit: `feat: season validation`.

---

### Task 4: Table after round N + table comparison

**Files:**
- Create: `src/lib/table.js`
- Test: `test/table.test.js`

**Interfaces:**
- Produces:
  - `tableAfterRound(matches: Match[], n: number) -> TableRow[]`: sorted by points, goal difference, goals for, then club name ascending (`localeCompare('hr')`). Includes every club that appears in `matches`, even one with 0 played.
  - `compareTables(computed: TableRow[], official: OfficialRow[]) -> string[]`: one message per club whose `played/won/drawn/lost/gf/ga` differ, or that is missing from either side. Ignores order and points.
  - `hasDeduction(row: OfficialRow) -> boolean`: true when `points !== 3*won + drawn`.

- [ ] **Step 1: Write failing tests**
  - Two hand-built rounds: check points, goal difference and sort order, including a tie broken by goals for and one broken by name.
  - `tableAfterRound(m, 0)` → every club has played 0.
  - Postponed match (Review Focus 5): round-1 match unplayed → `tableAfterRound(m, 14)` gives that club `played: 13`. Give it a score → `played: 14`, and the result is already counted in `tableAfterRound(m, 1)`.
  - Golden fixture test: `compareTables(tableAfterRound(sid34.matches, 36), sid34.officialTable)` → `[]`.
  - `compareTables` reports a club with a wrong `gf`, and reports a missing club.
  - `hasDeduction({won:10, drawn:5, points:33})` → true; `{won:10, drawn:5, points:35}` → false.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit: `feat: league table computation and comparison`.

---

### Task 5: Orchestrator (`npm run scrape`)

**Files:**
- Create: `scraper/run.js`
- Test: `test/run.test.js`

**Interfaces:**
- Consumes: everything above.
- Produces: `scrapeAll({ fetchImpl = fetch, sleep, outDir = 'public/data', log = console, seasons = SEASONS, current = CURRENT }) -> Promise<{ exitCode: 0|1 }>`. At the bottom, a CLI guard (`import.meta.url` vs `process.argv[1]`) runs it with real values and calls `process.exit(exitCode)`.

Behaviour per season, in order (past seasons first, then current, then ljestvica):

1. Fetch with up to 2 retries (backoff 2 s, then 4 s, via `sleep`). If every attempt fails: warn, keep any existing file, set exitCode 1.
2. Parse. If there are 0 matches: an existing file stays and the season is `ok`; with no file, the season is `unavailable`. Warn either way; this is not an error.
3. Validate (`allowUnplayed` only for the current season). If it fails: print the errors, keep any existing file, set exitCode 1. The season is `ok` if a file exists, otherwise `unavailable`.
4. Otherwise write a `SeasonFile` atomically (`.tmp` + `rename`).
5. Warn (not fail) for any past-season official-table row where `hasDeduction` is true, and for any `compareTables` mismatch.
6. After the current season: fetch ljestvica, then `compareTables(tableAfterRound(current, 36), standings)`. A mismatch only warns.
7. Write `index.json` atomically. It lists all 14 seasons in order, with `current: '2026-27'`.

`sleep(DELAY_MS)` runs between every pair of requests.

- [ ] **Step 1: Write failing tests.** Use a temp `outDir` (`fs.mkdtemp`), a fake `fetchImpl` that maps URLs to fixtures, and a no-op `sleep` that records its calls. Pass `seasons` with 2 entries so the test stays small.
  - happy path → both season files and `index.json` are written, statuses are `ok`, exitCode 0, and the sleep calls include 1000.
  - a past season served the empty fixture with no existing file → `unavailable`, exitCode 0.
  - Review Focus 4: an existing good file plus the empty fixture → the file's bytes are unchanged and the status is `ok`.
  - a fixture made invalid (one match row removed from the HTML string) with an existing file → the file is unchanged and exitCode is 1.
  - fetch throws 3 times → 3 attempts, exitCode 1, other seasons still written.
  - no `.tmp` files remain in `outDir` afterwards.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS. `npm test` → all suites PASS.
- [ ] **Step 5:** Commit: `feat: scrape orchestrator`.

---

### Task 6: Real run + golden test over all seasons

**Files:**
- Create: `test/golden.test.js`
- Create (output): `public/data/*.json`

**Interfaces:**
- Consumes: `public/data/index.json` and the season files, plus `tableAfterRound`, `compareTables` and `hasDeduction`.

- [ ] **Step 1:** Write `golden.test.js`. For each season in `index.json` with status `ok` and a non-null `officialTable` (the past seasons), run `compareTables(tableAfterRound(matches, 36), officialTable)` and expect `[]`. Log, but don't fail, the clubs where `hasDeduction` is true. If `public/data/index.json` is missing, skip the test with a message telling you to run `npm run scrape`.
- [ ] **Step 2:** `npm run scrape`. It takes about 30 s (15 requests × 1 s, plus parsing).
  Expected: exit code 0, and 14 season files plus `index.json` in `public/data/`, all `ok`.
  `2025-26.json` must have Dinamo at won 27, drawn 5, lost 4, gf 93, ga 28 in `officialTable`.
- [ ] **Step 3:** `npm test` → all PASS, including the golden test for 13 past seasons. If a season fails, the cause is a parser or data bug, not the test: fix it in `parse.js`, add a regression test there, and re-run.
- [ ] **Step 4:** Commit: `feat: scraped data 2013-14..2026-27 + golden test`.
