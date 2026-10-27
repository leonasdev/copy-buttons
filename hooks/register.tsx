import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderSurface } from 'claude-code'

import type { Copied, Format, Notice } from '../types'
import { renderReply } from './render'
import { GAP, labelOf, layoutRow, numbered, widthOfItem } from './fit'
import type { RowItem, RowPress } from './row'
import type { Action } from './fit'
import { copyables } from './blocks'
import type { Copyable } from './blocks'
import { isFinalAnswer, knownVerdict } from './transcript'
import { widthOf } from './width'

const DONE_MS = 1500
const ROW_RIGHT = 2
// Room the turn's closing line takes at the row's left
// (`✻ Cogitated for 12m 34s · done Tuesday 5:30 PM`), and a gap after it.
const CLOSING_LINE = 48
// Why a copy failed, and what to do, for each reason the engine gives; told
// in a toast whatever the copied notice setting, so it is seen. A terminal that
// drops an OSC 52 write says nothing, so that failure reads as a copy.
const FAILURES: Record<'no-surface' | 'no-clipboard' | 'refused', string> = {
  'no-clipboard':
    'no clipboard reachable. Over SSH, allow OSC 52 in your terminal (and set-clipboard on in tmux); very long text may exceed its limit',
  'no-surface': 'this session has no screen attached',
  refused: 'another plugin blocked it',
}
const FAILURE_MS = 8000

// How much was copied: a code block in lines, a table in rows (its header
// one of them), the reply in characters.
const count = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`
const linesOf = (text: string) => count(text.split('\n').length, 'line')
const hintFor = (other: Format) => ` · click again for ${other}`
// The transcript's closing row may land a moment after the turn's end.
const SETTLE_MS = 500
const ICONS: Record<string, string> = {
  standard: '⧉',
  'nerd-font': '\u{F018F}', // nf-md-content_copy
}

// Which action last copied, and for one with two formats which it took and
// which the next press takes: its icon reads ✓ a moment, its label kept so
// the row keeps its width and nothing moves.
const copied = atom({ plugin: 'copy-buttons', key: 'copied' } as const, null as Copied | null)

// A reply's verdict never changes once its turn has ended: read it once.
const finals = new Map<string, boolean>()

// Whether this session was told the buttons need fullscreen; the session's
// state, so a reload of the mod does not tell it again. `telling` covers the
// draws made before that write lands.
const toldFullscreen = atom({ plugin: 'copy-buttons', key: 'toldFullscreen' } as const, false)
let telling = false
// Short enough for the main screen's notification bar, which cuts it at its width.
const FULLSCREEN_HINT = 'copy buttons need fullscreen: add "tui": "fullscreen" to ~/.claude/settings.json, restart'
const HINT_MS = 10000

// The page each paged row shows, by the reply's requestId.
const pages = atom({ plugin: 'copy-buttons', key: 'pages' } as const, {} as Record<string, number>)

// Where a copy is told: `copied 5 lines` above the action, a toast, or a line at
// the right of the band above the prompt. The action's ✓ shows in every one.
type NoticeAt = 'above-button' | 'toast' | 'above-prompt'
const NOTICE_MS = 3000

// The line the band shows after a copy, with the copy it belongs to.
const notice = atom({ plugin: 'copy-buttons', key: 'notice' } as const, null as Notice | null)

// What a press puts on the clipboard and how it is told: the text, its size
// (`5 lines`), and for an action with two formats the one taken and the other.
type Copy = { id: string; text: string; size: string; format?: Format; other?: Format }

async function copy($: EngineInterface, what: Copy, surface: RenderSurface, noticeAt: NoticeAt) {
  const { id, text, size, format, other } = what
  const result = await $.ui.copy({ text, surface })
  if (!result.isCopied) {
    $.ui.toast(`✗ couldn't copy: ${FAILURES[result.reason]}`, { timeoutMs: FAILURE_MS })
    return
  }

  // What was copied, in green; where there is another format, how to take
  // it, in grey after it (a toast draws both alike).
  const message = format === undefined ? `✓ copied ${size} to clipboard` : `✓ copied ${size} as ${format}`
  const hint = other === undefined ? undefined : hintFor(other)
  if (noticeAt === 'toast') {
    $.ui.toast(hint === undefined ? message : message + hint, { timeoutMs: NOTICE_MS })
  } else if (noticeAt === 'above-prompt') {
    const shown: Notice = { id: `${id}:${await $.clock.now()}`, text: message, hint }
    await update($, notice, () => shown)
    $.clock.after(NOTICE_MS, () => {
      void update($, notice, last => (last?.id === shown.id ? null : last))
    })
  }

  const stamp = await $.clock.now()
  await update($, copied, () => ({ id, format, other, stamp }))
  $.clock.after(DONE_MS, () => {
    void update($, copied, last => (last?.stamp === stamp ? null : last))
  })
}

// A press as the person meant it, read at the moment it lands: the first
// format, or, while the action's last copy still shows ✓, the other one (a
// block, with one format, copies again).
// Resolves to the text it put on the clipboard.
async function pressAction(
  $: EngineInterface,
  requestId: string,
  action: Action,
  surface: RenderSurface,
  noticeAt: NoticeAt,
): Promise<string> {
  const id = `${requestId}:${action.key}`
  const done = await read($, copied)
  const formats = action.formats ?? []
  const at = done?.id === id && done.other !== undefined ? formats.findIndex(f => f.format === done.other) : 0
  const chosen = formats[Math.max(0, at)]
  const other = formats.find(f => f !== chosen)?.format
  const text = chosen === undefined ? action.text : chosen.text()
  await copy($, { id, text, size: (action.size ?? linesOf)(text), format: chosen?.format, other }, surface, noticeAt)
  return text
}

// A final answer's code blocks and tables with their names, read once per
// text: a redraw (a scroll moving the viewport's edge across it) reuses them.
type Parts = { parts: Copyable[]; names: string[]; labels: string[] }
const partsByReply = new Map<string, { text: string } & Parts>()

function partsOf(requestId: string, text: string): Parts {
  const known = partsByReply.get(requestId)
  if (known?.text === text) return known
  // Code blocks and tables in reading order: a block named by the file it
  // names, else its language; a table `table`; numbered where names repeat.
  const parts = copyables(text)
  const names = parts.map(part => (part.kind === 'table' ? 'table' : (part.file ?? (part.language || 'code'))))
  const found = { text, parts, names, labels: numbered(names) }
  partsByReply.set(requestId, found)
  return found
}

// What each drawn row's clicks reach, by the reply's requestId: its actions
// by key, and its page turn. Kept from the row's last draw.
const rows = new Map<string, { actions: Map<string, Action>; turnPage: (by: number) => Promise<unknown> }>()

export const register: Register = (on, options) => {
  const icon = ICONS[String(options.icon)] ?? ICONS.standard
  const noticeAt: NoticeAt =
    options.copiedNotice === 'toast' || options.copiedNotice === 'above-prompt' ? options.copiedNotice : 'above-button'
  // The reply's first press copies this format; a press while it reads ✓
  // copies the other. A table's first press copies it for a spreadsheet.
  const replyFormats: Format[] = options.replyFormat === 'rendered' ? ['rendered', 'markdown'] : ['markdown', 'rendered']

  // The band's line sits at its right end, in the place the engine's own copy
  // notice takes; with nothing to say the band is the engine's alone.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const shown = noticeAt === 'above-prompt' && !e.props.hasSurvey ? await read($, notice) : null
    if (shown === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const drawn = await next(e)
    return (
      <Box flexDirection="column">
        {drawn}
        <Box flexDirection="row" justifyContent="flex-end" paddingRight={ROW_RIGHT}>
          <Text color="success">{shown.text}</Text>
          {shown.hint !== undefined && <Text dimColor>{shown.hint}</Text>}
        </Box>
      </Box>
    )
  })

  // A reply drawn while its turn ran is asked again once the turn has ended.
  on('turn.complete', async ($, e, next) => {
    const ended = await next(e)
    if (e.agentId === undefined) {
      $.ui.invalidate('ui.render')
      $.clock.after(SETTLE_MS, () => $.ui.invalidate('ui.render'))
    }

    return ended
  })

  // A click on the row, posted by its module: the press of the action under it.
  on('ui.message', { component: 'AssistantMessage' }, async ($, e) => {
    const row = rows.get(e.requestId)
    const key = (e.data as Partial<RowPress> | null)?.key
    if (row === undefined || typeof key !== 'string') return {}
    if (key === 'page-more' || key === 'page-back') {
      await row.turnPage(key === 'page-more' ? 1 : -1)
      return {}
    }
    const action = row.actions.get(key)
    if (action !== undefined) await pressAction($, e.requestId, action, e.surface, noticeAt)
    return {}
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    // Summaries are not the real text; other surfaces have their own copy controls.
    if (e.props.isSummary || e.surface !== 'terminal') return next(e)
    // Off fullscreen the terminal reports no clicks: a row nobody can press is
    // left out, and the session is told once how to turn fullscreen on (after
    // the draw: a write made while drawing is not kept).
    if (e.viewport?.isFullscreen === false) {
      if (!telling && !(await read($, toldFullscreen))) {
        telling = true
        $.clock.after(0, () => {
          $.ui.toast(FULLSCREEN_HINT, { timeoutMs: HINT_MS })
          void update($, toldFullscreen, () => true)
        })
      }
      return next(e)
    }

    // Only a turn's final answer carries the row, not the notes between tool
    // calls: the session's own transcript says which, for any reply in it.
    // The reply is never held for that: one the transcript has not said of
    // yet (a long session just opened, a turn just ended) draws as it is, and
    // draws again with its row once the transcript has been read.
    const isFinal = finals.get(e.requestId) ?? knownVerdict(e.requestId)
    if (isFinal === undefined) {
      void isFinalAnswer($, e.requestId).then(verdict => {
        if (verdict === undefined) return
        finals.set(e.requestId, verdict)
        if (verdict) $.ui.invalidate('ui.render')
      })
      return next(e)
    }
    finals.set(e.requestId, isFinal)
    if (!isFinal) return next(e)

    const text = e.props.text

    const { Box, Text, Client } = $.ui.resolve(e)
    const { parts, names, labels } = partsOf(e.requestId, text)
    const done = await read($, copied)
    const page = (await read($, pages))[e.requestId] ?? 0
    const drawn = await next(e)

    // The reply and each table have two formats, a press while one reads ✓
    // taking the other; the reply's rendered text is laid out when pressed.
    const replyText = (format: Format) => (format === 'rendered' ? renderReply(text) : text)
    const all: Action[] = [
      {
        key: 'copy-reply',
        label: 'Reply',
        text,
        isReply: true,
        formats: replyFormats.map(format => ({ format, text: () => replyText(format) })),
        size: copiedText => count([...copiedText].length, 'char'),
      },
      ...parts.map((part, i): Action => {
        // Keys count code blocks and tables apart, so a block's key is the same
        // whatever tables the reply holds.
        const n = parts.slice(0, i).filter(other => other.kind === part.kind).length
        const base = { label: labels[i] ?? part.kind, isReply: false, name: names[i] }
        if (part.kind === 'table') {
          return {
            ...base,
            key: `copy-table:${n}`,
            text: part.tsv,
            formats: [
              { format: 'spreadsheet', text: () => part.tsv },
              { format: 'rendered', text: () => part.rendered },
            ],
            size: () => count(part.rows, 'row'),
          }
        }
        return { ...base, key: `copy-code:${n}`, text: part.code, isFile: part.file !== undefined, size: linesOf }
      }),
    ]
    // Whole labels beside the closing line's own text if they fit; else on the
    // blank row above it, which has the reply's indent of room to spare, whole,
    // then cut short, then paged. A copy above is told by its ✓ alone.
    const columns = e.viewport?.columns ?? Infinity
    const { isAbove, items } = layoutRow(all, columns - ROW_RIGHT - CLOSING_LINE, columns - ROW_RIGHT - 2, page)
    const turnPage = (by: number) =>
      update($, pages, old => ({ ...old, [e.requestId]: Math.max(0, (old[e.requestId] ?? 0) + by) }))
    rows.set(e.requestId, { actions: new Map(all.map(action => [action.key, action])), turnPage })

    // Columns from the row's right end to each item's: the widths of the
    // items after it and the gaps between them.
    const widths = items.map(widthOfItem)
    // The row as its module draws it: each item's text, columns and tone.
    let column = 0
    const rowItems: RowItem[] = items.map((item, i) => {
      const isDone = item.kind === 'action' && done?.id === `${e.requestId}:${item.action.key}`
      const text = item.kind === 'action' ? `${isDone ? '✓' : icon} ${item.action.label}` : labelOf(item)
      const from = column
      column += (widths[i] ?? 0) + GAP
      const key = item.kind === 'action' ? item.action.key : `page-${item.kind}`
      return { key, text, from, to: from + (widths[i] ?? 0), tone: item.kind !== 'action' ? 'page' : isDone ? 'done' : 'idle' }
    })
    const row = { items: rowItems, gap: GAP }
    const rowWidth = Math.max(0, column - GAP)
    const rightOf = items.map((_, i) => widths.slice(i + 1).reduce((sum, w) => sum + w + GAP, 0))
    const doneAt = items.findIndex(item => item.kind === 'action' && done?.id === `${e.requestId}:${item.action.key}`)
    // Above the pressed action, which already reads ✓: for a block how many
    // lines it took; for the reply or a table the format it took and what
    // another press takes. A label too long to start over its action ends at
    // the screen's edge.
    const pressed = items[doneAt]
    const pressedAction = pressed?.kind === 'action' ? pressed.action : undefined
    const label =
      done?.format === undefined
        ? `copied ${(pressedAction?.size ?? linesOf)(pressedAction?.text ?? '')}`
        : `copied as ${done.format}`
    const hint = done?.other === undefined ? '' : hintFor(done.other)
    const labelWidth = widthOf(label + hint)

    // The engine draws the reply as it always does. The actions take no row of
    // their own: they sit at the right end of the turn's closing line
    // (`✻ Cooked for …`), which the engine draws two rows below the reply,
    // and `copied 5 lines` shows in the blank row above the one just pressed, its
    // first letter over that action's ✓.
    return (
      <Box flexDirection="column">
        {drawn}
        <Box height={0} width="100%" position="relative">
          {noticeAt === 'above-button' && !isAbove && doneAt >= 0 && (
            <Box
              position="absolute"
              top={0}
              right={Math.max(0, ROW_RIGHT + (rightOf[doneAt] ?? 0) + (widths[doneAt] ?? 0) - labelWidth)}
              width={labelWidth}
              flexShrink={0}
            >
              <Text color="success">{label}</Text>
              {hint !== '' && <Text dimColor>{hint}</Text>}
            </Box>
          )}
          <Box position="absolute" top={isAbove ? 0 : 1} right={ROW_RIGHT} flexDirection="row">
            <Client key="row" module="./row.ts" props={row} width={rowWidth} height={1} />
          </Box>
        </Box>
      </Box>
    )
  })
}
