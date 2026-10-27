import type { EngineInterface } from 'claude-code'

import { posix, windows } from './readers'
import type { Reader } from './readers'

// What one transcript says so far: the replies that ended their turn, those
// that did not, the latest text still waiting on what follows it, and how far
// it has been read.
type Index = {
  file: string
  offset: number
  finals: Set<string>
  others: Set<string>
  pending: string | null
  reading: Promise<void> | null
  readAt: number
}

// Folds a scan's tokens into the index: a reply is its turn's final answer
// when the turn's closing line is the next thing that matters after it.
export function fold(index: Pick<Index, 'finals' | 'others' | 'pending'>, tokens: readonly string[]) {
  for (const token of tokens) {
    const [kind, uuid] = token.split(' ')
    if (kind === 'T' && uuid !== undefined) {
      if (index.pending !== null) index.others.add(index.pending)
      index.pending = uuid
    } else if (kind === 'D' && index.pending !== null) {
      index.finals.add(index.pending)
      index.pending = null
    } else if ((kind === 'U' || kind === 'P') && index.pending !== null) {
      index.others.add(index.pending)
      index.pending = null
    }
  }
}

// Kept in memory only, one per transcript, gone with the session.
const indexes = new Map<string, Index>()
let located: { session: string; file: string } | null = null

// A render asks often while a reply streams; a read of the same file sooner
// than this after the last one waits for the next ask (the turn's end asks).
const REREAD_MS = 250

// The platform's way of reading the transcript, chosen once: PowerShell on
// Windows (where `OS` is `Windows_NT`), POSIX tools on Linux, macOS and WSL.
let reader: Promise<Reader> | null = null

function readerOf($: EngineInterface): Promise<Reader> {
  reader ??= (async () => {
    if ((await $.env.get('OS')) !== 'Windows_NT') return posix
    const config = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${(await $.env.get('USERPROFILE')) ?? ''}\\.claude`
    return windows(`${config}\\projects`)
  })()
  return reader
}

// For a probe or test that reads with a reader of its own; null chooses
// again by the platform at the next read.
export function useReader(chosen: Reader | null) {
  reader = chosen === null ? null : Promise.resolve(chosen)
}

// Asks made while the session's file is being looked for wait on that look.
let locating: { session: string; found: Promise<string | undefined> } | null = null

async function locate($: EngineInterface, session: string, uuid: string): Promise<string | undefined> {
  if (located?.session === session) return located.file
  if (locating?.session === session) {
    const found = await locating.found
    if (located?.session === session) return found
  }

  const found = (async () => {
    const read = await readerOf($)
    const ran = await $.process.run(read.locate(session, uuid), { timeoutMs: 10000 })
    if (ran.exitCode !== 0 || ran.stdout.trim() === '') return undefined
    const file = read.decodePath(ran.stdout)
    // A file found by the reply rather than by the session may be another
    // session's: look again next time, until the session's own exists.
    const name = `${session}.jsonl`
    const isOwn = file.endsWith(`/${name}`) || file.endsWith(`\\${name}`)
    if (isOwn) located = { session, file }
    return file
  })()
  locating = { session, found }
  try {
    return await found
  } finally {
    if (locating?.found === found) locating = null
  }
}

// Reads what was added to the transcript since the last read; asks made while
// one read runs wait on that read.
async function refresh($: EngineInterface, index: Index): Promise<void> {
  if (index.reading !== null) return index.reading
  index.reading = (async () => {
    const read = await readerOf($)
    const ran = await $.process.run(read.scan(index.file, index.offset), { timeoutMs: 20000 })
    if (ran.exitCode !== 0) return
    const tokens = ran.stdout.split('\n').filter(line => line !== '')
    const end = tokens.pop()
    if (end?.startsWith('O ') !== true) return
    fold(index, tokens)
    index.offset = Number(end.slice(2))
    index.readAt = await $.clock.now()
  })().finally(() => {
    index.reading = null
  })
  return index.reading
}

// What any transcript read so far says of the reply, with no read of its
// own: what a draw can know at once.
export function knownVerdict(uuid: string): boolean | undefined {
  for (const index of indexes.values()) {
    if (index.finals.has(uuid)) return true
    if (index.others.has(uuid)) return false
  }
  return undefined
}

// True when the reply with this uuid is its turn's final answer and the turn's
// closing line (`✻ Cooked for …`) follows it; false when not; undefined while
// the turn still runs or the transcript cannot be read.
export async function isFinalAnswer($: EngineInterface, uuid: string): Promise<boolean | undefined> {
  const file = await locate($, await $.session.id(), uuid)
  if (file === undefined) return undefined

  let index = indexes.get(file)
  if (index === undefined) {
    index = { file, offset: 0, finals: new Set(), others: new Set(), pending: null, reading: null, readAt: -Infinity }
    indexes.set(file, index)
  }

  const known = () => (index.finals.has(uuid) ? true : index.others.has(uuid) ? false : undefined)
  if (known() !== undefined) return known()
  if ((await $.clock.now()) - index.readAt >= REREAD_MS || index.readAt === -Infinity) {
    await refresh($, index)
  }
  return known()
}

