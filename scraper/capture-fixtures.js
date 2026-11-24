// One-off: save real hnl.hr pages into test/fixtures/ so tests run offline.
import { writeFile, mkdir } from 'node:fs/promises'
import { archiveUrl, CURRENT, STANDINGS_URL, DELAY_MS } from './config.js'

const pages = [
  ['archive-sid34.html', archiveUrl(34)],
  ['current.html', CURRENT.url],
  ['ljestvica.html', STANDINGS_URL],
]

await mkdir('test/fixtures', { recursive: true })
for (const [i, [name, url]] of pages.entries()) {
  if (i > 0) await new Promise(r => setTimeout(r, DELAY_MS))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  const html = await res.text()
  await writeFile(`test/fixtures/${name}`, html)
  console.log(`${name}: ${html.length} bytes`)
}
