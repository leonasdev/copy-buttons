// Checks the `rendered` copy against the terminal's own drawing, sample by
// sample: a Claude Code session in a detached tmux window wide enough that
// nothing wraps is asked to answer with each sample verbatim; the answer as
// the transcript recorded it goes through renderReply, and the result is
// compared line by line with the screen.
//
//   bun dev/check-rendering.ts [sample.md ...]   (default: dev/samples/*.md)
//
// With CHECK_OUT=<folder>, each sample's answer, screen and rendered copy are
// written there (<name>.answer.md, .screen.txt, .rendered.txt) to diff.
//
// Run it from a folder Claude Code trusts (the mod's own). Needs tmux, bun
// and a signed-in `claude`. Each sample costs one short turn. The sessions it
// starts are deleted afterwards.

import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

import { renderReply } from '../hooks/render'

const HERE = dirname(new URL(import.meta.url).pathname)
// A folder Claude Code already trusts, or it stops at the trust question: the
// one the check runs from (the mod's own, typically).
const CWD = process.cwd()
const PROJECTS = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'projects')
const TMUX = 'copy-buttons-check'

const sh = (...argv: string[]) => {
  const ran = Bun.spawnSync(argv)
  return ran.stdout.toString()
}
const sleep = (ms: number) => Bun.sleepSync(ms)
const screen = () => sh('tmux', 'capture-pane', '-p', '-J', '-t', TMUX, '-S', '-')
const closings = () => screen().split('\n').filter(line => /^✻ \S+ for /.test(line)).length

const transcripts = () =>
  readdirSync(PROJECTS).flatMap(dir => {
    try {
      return readdirSync(join(PROJECTS, dir))
        .filter(name => name.endsWith('.jsonl'))
        .map(name => join(PROJECTS, dir, name))
    } catch {
      return []
    }
  })

// The last answer's text, as the transcript holds it.
function lastAnswer(file: string): string | undefined {
  const rows = readFileSync(file, 'utf8').trim().split('\n').map(line => JSON.parse(line))
  for (const row of rows.reverse()) {
    const block = row.message?.role === 'assistant' && !row.isSidechain ? row.message.content?.[0] : undefined
    if (block?.type === 'text') return block.text
  }
  return undefined
}

// The answer as drawn: from its bullet to the closing line, the reply's
// two-column indent taken off and trailing space trimmed.
function drawnAnswer(): string[] {
  const lines = screen().split('\n')
  const end = lines.findLastIndex(line => /^✻ \S+ for /.test(line))
  const start = lines.slice(0, end).findLastIndex(line => line.startsWith('● '))
  return lines
    .slice(start, end)
    .map(line => line.slice(2).replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n+$/, '')
    .split('\n')
}

const samples = process.argv.slice(2).length > 0
  ? process.argv.slice(2).map(path => resolve(path))
  : readdirSync(join(HERE, 'samples')).filter(name => name.endsWith('.md')).sort().map(name => join(HERE, 'samples', name))

const before = new Set(transcripts())
sh('tmux', 'kill-session', '-t', TMUX)
Bun.spawnSync(['tmux', 'new-session', '-d', '-s', TMUX, '-x', '400', '-y', '200', '-c', CWD, 'claude'])
sleep(9000)

let failed = 0
for (const sample of samples) {
  const seen = closings()
  const prompt = `Read ${sample} with the Read tool, then reply with exactly its contents as your answer, verbatim, with nothing before or after.`
  sh('tmux', 'send-keys', '-t', TMUX, '-l', prompt)
  sleep(500)
  sh('tmux', 'send-keys', '-t', TMUX, 'C-m')
  for (let waited = 0; closings() <= seen && waited < 120_000; waited += 1000) sleep(1000)
  sleep(1000)

  const file = transcripts().filter(path => !before.has(path)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
  const answer = file === undefined ? undefined : lastAnswer(file)
  if (answer === undefined) {
    console.log(`✘ ${basename(sample)}: no answer found`)
    failed++
    continue
  }
  const want = drawnAnswer()
  const got = renderReply(answer).split('\n')
  const out = process.env.CHECK_OUT
  if (out !== undefined) {
    mkdirSync(out, { recursive: true })
    const name = basename(sample, '.md')
    writeFileSync(join(out, `${name}.answer.md`), answer)
    writeFileSync(join(out, `${name}.screen.txt`), `${want.join('\n')}\n`)
    writeFileSync(join(out, `${name}.rendered.txt`), `${got.join('\n')}\n`)
  }
  const diffs = want.flatMap((line, i) => (line === got[i] ? [] : [i])).concat(got.length > want.length ? [want.length] : [])
  if (diffs.length === 0) {
    console.log(`✔ ${basename(sample)}: ${want.length} lines identical`)
    continue
  }
  failed++
  console.log(`✘ ${basename(sample)}: ${diffs.length} lines differ`)
  for (const i of diffs.slice(0, 12)) {
    console.log(`  line ${i + 1}\n    screen:   ${JSON.stringify(want[i] ?? null)}\n    rendered: ${JSON.stringify(got[i] ?? null)}`)
  }
  if (answer.trimEnd() !== readFileSync(sample, 'utf8').trimEnd()) console.log('  (the answer is not the sample verbatim; compared against the answer)')
}

sh('tmux', 'kill-session', '-t', TMUX)
for (const path of transcripts()) if (!before.has(path)) rmSync(path)
console.log(failed === 0 ? 'all samples match' : `${failed} of ${samples.length} samples differ`)
process.exit(failed === 0 ? 0 : 1)
