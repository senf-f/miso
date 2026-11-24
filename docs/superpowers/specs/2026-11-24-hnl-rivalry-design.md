# HNL rivalry app (Medin dan / Galebov dan): design

Source: GitHub issue senf-f/ideje#11 ("aplikacija za praćenje st. Totteringham dana").
Brainstormed 2026-11-01, finished 2026-11-24.

## 1. Intent

This is a fun toy for the user and their friends, not a product. It tracks the Dinamo Zagreb vs Hajduk Split rivalry in the Croatian top league (SuperSport HNL), season by season and round by round. Two invented characters act out the rivalry: a bear for Dinamo and a seagull for Hajduk. The celebration day comes when one club can no longer finish below the other.

Success means friends can open it, pick a season and round, and smile at the characters, the gap chart and the table.

### Goals
- Show the Dinamo–Hajduk points gap after any round of any season from 2013/14 to the current season.
- Mark the round when the rivalry was decided: **Medin dan** if Dinamo can no longer finish below Hajduk, **Galebov dan** if Hajduk can no longer finish below Dinamo.
- Give the two characters moods that react to the gap.
- Show the full league table after the selected round.
- Keep the UI in Croatian.

### Non-goals
- The title race or other clubs' rivalries. The celebration trigger is the rivalry only.
- Seasons before 2013/14. 2012/13 had a 33-round format.
- Points deductions and official head-to-head tiebreakers (known limitations).
- Hosting and automation. The app runs locally for now; GitHub Pages and Actions may come later.
- Accounts, notifications, backend, database.

### Anti-goals (failures even if it works)
- Mocking either club or its fans. The tone must stay friendly; the losing character is "hrabro razočaran", never humiliated.
- Using the name "Totteringham" (that's Arsenal/Spurs) anywhere in the UI.
- Using real crests, logos or official mascots. The characters are invented.
- Hammering hnl.hr: requests are sequential, with a delay.

## 2. Constraints
- No free HNL API exists (TheStatsAPI is paid), so data comes from scraping hnl.hr.
- Node.js LTS (v26.13.0 installed). No Python on the machine.
- The project folder `miso/` currently holds only brainstorm leftovers in `.superpowers/` and is not a git repo yet. When git is initialised, `.superpowers/` goes into `.gitignore`.

## 3. Approaches considered

1. **Static site + local Node scraper writing JSON (chosen).** The scraper runs on demand and writes `public/data/*.json`; the site only reads those files. It's simple, works offline, and is cheap to host on GitHub Pages later. Data is only as fresh as the last scraper run.
2. **Scrape from the browser at page load.** Always fresh, but hnl.hr doesn't send CORS headers, so it would need a proxy. Every visitor would also hit hnl.hr, and one HTML change would break the page for everyone.
3. **Paid stats API (TheStatsAPI).** Cleaner data, but it costs money and needs an API key, which doesn't fit a toy.

Option 1 was picked because it matches the toy scope, needs no key, and keeps hnl.hr traffic to a few requests per run.

## 4. Data

### Sources (hnl.hr, server-rendered HTML, parsed with cheerio)
- **Current season:** `https://hnl.hr/supersport-hnl/raspored-i-rezultati/`. All 36 rounds are on one page.
- **Past seasons:** `https://hnl.hr/povijest/rezultati-i-poretci/?sid=N`, with the same row format. sid=23 is 2013/14 … sid=35 is 2025/26. As of 2026-11-24, sid=35 has all 36 rounds; it was empty on 2026-11-01.
- **Current season (as of 2026-11-24):** 2026/27. The current-season page carries no season label, so the season is inferred from its dates (31.07.2026 to 22.05.2027) or set in config. Rounds 1 to 14 are played. Round 2 contains a postponed match, Rijeka–Dinamo on 03.12.2026, which is a real case for the postponed-match rule.
- **Archive pages also hold the official final table:** columns `# | Klub | Uk | Pob | Ner | Por | G+ | G- | GR | Bod`. The golden test uses it (see §8).
- **Ignore the sidebar "Ljestvica" widget.** It appears on every page (archive and current) and shows the live current table. It must never be mistaken for the season's table.
- **Row format:** a `<th>N. kolo</th>` row starts round N. It is followed by match rows: date / home / home goals / " : " / away goals / away. Empty scores mean the match is not played yet.
- **Cross-check source:** `https://hnl.hr/supersport-hnl/ljestvica/` (current table).

### Scraper behaviour
- Sequential requests with about a 1 s delay between them.
- One output file per season, `public/data/<season>.json` (e.g. `2024-25.json`), plus `public/data/index.json` listing the seasons and their status (`ok` / `unavailable`).
- The mapping between season and sid lives in one config table in the scraper. Discovering the current season's sid is the builder's call; a hardcoded entry is fine.
- The season JSON shape is the builder's call. It must at least include, per match: round, date (if present), home, away, home goals and away goals (null if unplayed).

## 5. Rules (pure logic)

- **Table after round N** = all played matches with round ≤ N. A postponed match counts in its original round once it is played.
- **Points:** win 3, draw 1, loss 0. Deductions are ignored.
- **Sort:** points, then goal difference, then goals for, then name. This is not the official head-to-head rule.
- **Lock (Medin/Galebov dan):** the leading club locks the rivalry when its points are greater than the trailing club's points + 3 × the trailing club's remaining matches (matches not yet counted in the table after round N). The comparison is strict and ignores tiebreakers. The first round where this holds is the celebration day.
- **Bonus line before the lock:** "X bodova do Medinog/Galebovog dana", where X is how many more points the leader needs (based on the current state) to satisfy the lock condition.
- **Mood:** computed from each club's points minus its rival's points.

  | Difference | Mood |
  |---|---|
  | ≤ −7 | tužan |
  | −6 … −3 | zabrinut |
  | −2 … +2 | napet |
  | +3 … +6 | veseo |
  | ≥ +7 | presretan |

  After the lock, the winner is "pobjeda" and the other club is "hrabro razočaran".

## 6. Frontend

- Vite + plain JavaScript modules. SVG is hand-made; there's no framework and no chart library.
- **Layout (option C):**
  ```
  [ Sezona ▾ ]   ‹  12. kolo  ›   ─────●──────
  ┌───────────────────────────────────────────┐
  │   🐻 medvjed     gap: +5     galeb 🕊      │   ← stage
  └───────────────────────────────────────────┘
  gap-over-rounds chart (click a round to jump; marker on Medin/Galebov dan)
  league table after selected round
  ```
- **Components:** SeasonPicker, RoundStepper (stepper + slider), Stage, GapChart, Table, `characters/bear.js`, `characters/seagull.js`.
- **Characters (style B):**
  - A blue bear for Dinamo, with a Zagreb/Medvednica feel.
  - A white seagull for Hajduk, with a Split/Riva feel and a red and blue scarf.
  - Each has a pose or expression per mood.
- **URL state** lives in the hash: `#2026-27/12` means season 2026/27, round 12.
- Respect `prefers-reduced-motion`.
- All UI text is in Croatian.
- **App name:** undecided. Use a placeholder; the user will name it later.

## 7. Error handling

### Scraper
- **Network error:** retry twice with a short backoff. If it still fails, skip that season, keep its existing JSON, and print a warning.
- **Validation, past season:** exactly 36 rounds with 5 matches each, and each score either two integers or empty. On failure, keep the previous good file and exit non-zero.
- **Validation, current season:** the same structure check, but empty scores are allowed (unplayed).
- **Season empty on hnl.hr** (as sid=35 was until recently): mark it `unavailable` in `index.json` and try again on the next run.
- **Writes:** write to a temp file and rename, so a crash never leaves a half-written JSON.
- **Table cross-check:** compare our computed current table with `/ljestvica/`. A mismatch only produces a warning, because deductions are a known limitation.

### Frontend
- **`index.json` fails to load:** show a friendly Croatian message in place of the stage.
- **Invalid or unknown hash:** fall back to the newest available season and its latest played round.
- **Unavailable seasons:** shown in the dropdown, greyed out, labelled "još nije dostupno".
- **Round 0 / no matches played:** both characters are *napet* and the table shows all zeros.

## 8. Testing

- **Runner:** Vitest (dev dependency).
- **Parser tests:** run against saved hnl.hr HTML fixtures: one finished season including its final table, the current season (partly played, with the postponed round-1 match), and a synthetic empty-season page. sid=35 is no longer empty, so the empty page is made by hand.
- **Unit tests for the pure logic:**
  - table after round N, including postponed matches
  - the sort order
  - the lock rule, including the exactly-equal edge case (equal must not lock)
  - mood thresholds at every boundary
  - the bonus-line count
  - hash parsing and fallback
- **Golden test (builder's call, decided at spec time):** for every past season, compare our computed per-club played/W/D/L/GF/GA against the official final table on the same archive page. The scraper saves that table into the season JSON. Order and points are not compared: order differs on ties because we don't use head-to-head, and points differ where there were deductions. A season whose official `Bod` ≠ 3×W + D is flagged as having a deduction, so no hand-kept list is needed.
- **No automated browser tests.** Characters, chart and layout are checked by hand in `vite dev`.

## 9. Left to the builder
- The season JSON schema beyond the minimum fields above.
- File and folder layout, apart from `public/data/`, and npm script names.
- The exact SVG art and animation for each mood, within style B.
- Colours and typography, as long as there are no real crests or logos.
- How the current season's sid or URL is configured.
