import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { codeBlocks, copyables, readInfo } from '../hooks/blocks'
import { abbreviate, labelOf, layoutRow } from '../hooks/fit'
import { widthOf } from '../hooks/width'
import { renderReply } from '../hooks/render'
import type { RowItem, RowProps } from '../hooks/row'
import { fold, useReader } from '../hooks/transcript'
import { onScreenPart, placeBlocks, placeOn } from '../hooks/place'
import { layOut, wrap } from '../hooks/wrap'

const ANSWER = [
  'Run this:',
  '',
  '```bash',
  'echo hi',
  'ls -la',
  '```',
  '',
  '```bash',
  'pwd',
  '```',
  '',
  '```ts',
  'console.log(1)',
  '```',
].join('\n')

const MESSAGE = {
  plugin: 'copy-buttons',
  component: 'AssistantMessage',
  requestId: 'msg-1',
  surface: 'terminal',
  props: { text: ANSWER, isFirstOfReply: true },
} as const

// What the transcript scan prints for the rows after the reply `msg-1`.
const AFTER = {
  closing: ['D'],
  toolUse: ['U', 'T other', 'D'],
  moreText: ['T other', 'D'],
  prompt: ['P'],
  running: [] as string[],
}

// Each test its own session: the lookup keeps what it read in memory.
let sessions = 0
// The row of a mounted reply, as its module is handed it, and a click on one
// of its items, as the person's would land.
type Mounted = {
  find: (query: { type?: string; key?: string; text?: string | RegExp; in?: string }) => Promise<{ props: Record<string, unknown> } | undefined>
  pointer: (event: { type: 'down' | 'move' | 'leave'; x: number; y: number; button?: 'left'; in: string }) => Promise<void>
}
const rowOf = async (ui: Mounted): Promise<RowItem[]> =>
  ((await ui.find({ type: 'Client' }))?.props.props as RowProps | undefined)?.items ?? []
const labels = async (ui: Mounted) => (await rowOf(ui)).map(item => item.text)
const item = async (ui: Mounted, key: string) => (await rowOf(ui)).find(one => one.key === key)
async function click(ui: Mounted, key: string) {
  const found = await item(ui, key)
  if (found === undefined) throw new Error(`no row item ${key}`)
  await ui.pointer({ type: 'down', x: found.from, y: 0, button: 'left', in: 'row' })
}

// Nothing sits beneath the plugin in a test: these stand for the engine, the
// transcript lookup finding the session's file and scanning it.
const engine = (on: On, after: readonly string[] = AFTER.closing) => {
  const session = `s${++sessions}`
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine reply</Text>
  })
  on('session.id', () => ({ value: session }))
  on('env.get', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    const isLocate = e.argv.includes(session)
    const stdout = isLocate ? `/p/${session}.jsonl` : ['T msg-1', ...after, 'O 100'].join('\n')
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return mock.clock(on)
}

test('finds each code block in reading order with its language', () => {
  expect(codeBlocks(ANSWER)).toEqual([
    { code: 'echo hi\nls -la', language: 'bash' },
    { code: 'pwd', language: 'bash' },
    { code: 'console.log(1)', language: 'ts' },
  ])
})

test('a block inside a list item or a quote counts, without its indent or >', () => {
  const markdown = [
    '1. Install:',
    '',
    '   ```bash',
    '   npm install',
    '     --save',
    '   ```',
    '2. Done',
    '',
    '> ```sh',
    '> echo quoted',
    '> ```',
    '',
    '```ts src/app.ts',
    'let a = 1',
    '```',
  ].join('\n')
  expect(codeBlocks(markdown)).toEqual([
    { code: 'npm install\n  --save', language: 'bash' },
    { code: 'echo quoted', language: 'sh' },
    { code: 'let a = 1', language: 'ts', file: 'app.ts' },
  ])
})

test('a fence names its file after the language, joined to it, or by a key', () => {
  expect(readInfo('ts src/app.ts')).toEqual({ language: 'ts', file: 'app.ts' })
  expect(readInfo('ts:src/app.ts')).toEqual({ language: 'ts', file: 'app.ts' })
  expect(readInfo('python title="main.py"')).toEqual({ language: 'python', file: 'main.py' })
  expect(readInfo("yaml filename='config/ci.yml'")).toEqual({ language: 'yaml', file: 'ci.yml' })
  expect(readInfo('js {1,3}')).toEqual({ language: 'js' })
  expect(readInfo('bash')).toEqual({ language: 'bash' })
  expect(readInfo('')).toEqual({ language: '' })
})

test('a block that names a file is labeled by it, cut short when the row is narrow', async ($, on) => {
  engine(on)
  const text = ['```ts src/app.ts', 'a', '```', '```ts src/app.ts', 'b', '```', '```yaml config/very-long-name.yml', 'c', '```', '```sh', 'd', '```'].join('\n')
  const ui = await $.ui.mount({ ...MESSAGE, props: { text, isFirstOfReply: true } })
  expect(await labels(ui)).toEqual([
    '⧉ Reply',
    '⧉ app.ts 1',
    '⧉ app.ts 2',
    '⧉ very-long-name.yml',
    '⧉ sh',
  ])
  await ui.unmount()

  const short = abbreviate([
    { key: 'r', label: 'Reply', text: '', isReply: true },
    { key: 'f', label: 'very-long-name.yml', text: '', isReply: false, name: 'very-long-name.yml', isFile: true },
    { key: 'l', label: 'python', text: '', isReply: false, name: 'python' },
  ])
  expect(short.map(a => a.label)).toEqual(['Reply', 'very-long…', 'py'])
})

test('a table copies as tab-separated rows, quoted where a cell needs it', () => {
  const markdown = [
    '| 名稱 | 數量 | 備註 |',
    '|---|--:|---|',
    '| **apple** | 3 | 紅色 |',
    '| `banana` | 12 | [連結](https://x.y) |',
    '| say "hi" | 1 | a<br>b |',
  ].join('\n')
  const [table] = copyables(markdown)
  expect(table).toMatchObject({
    kind: 'table',
    rows: 4,
    tsv: ['名稱\t數量\t備註', 'apple\t3\t紅色', 'banana\t12\t連結 (https://x.y)', '"say ""hi"""\t1\ta<br>b'].join('\n'),
  })
})

test('code blocks and tables come in reading order, tables in a list or quote too', () => {
  const markdown = ['| a |', '|---|', '| 1 |', '', '```sh', 'ls', '```', '', '- item', '', '  | b |', '  |---|', '  | 2 |'].join('\n')
  expect(copyables(markdown).map(part => part.kind)).toEqual(['table', 'code', 'table'])
})

test('a table copies for a spreadsheet, then rendered on a press while it reads ✓', async ($, on) => {
  engine(on)
  const copied: string[] = []
  on('ui.copy', (_, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  const text = ['| a | b |', '|---|---|', '| 1 | 2 |', '| 3 | 4 |', '', '```sh', 'ls', '```', '', '| c |', '|---|', '| 5 |'].join('\n')
  const ui = await $.ui.mount({ ...MESSAGE, props: { text, isFirstOfReply: true } })
  expect(await labels(ui)).toEqual(['⧉ Reply', '⧉ table 1', '⧉ sh', '⧉ table 2'])
  await click(ui, 'copy-table:0')
  expect(copied).toEqual(['a\tb\n1\t2\n3\t4'])
  expect(await ui.find({ type: 'Text', text: 'copied as spreadsheet' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' · click again for rendered' })).toBeDefined()

  await click(ui, 'copy-table:0')
  expect(copied[1]).toBe(
    ['┌─────┬─────┐', '│  a  │  b  │', '├─────┼─────┤', '│ 1   │ 2   │', '├─────┼─────┤', '│ 3   │ 4   │', '└─────┴─────┘'].join('\n'),
  )
  expect(await ui.find({ type: 'Text', text: 'copied as rendered' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' · click again for spreadsheet' })).toBeDefined()

  await click(ui, 'copy-code:0')
  expect(copied[2]).toBe('ls')
  expect(await ui.find({ type: 'Text', text: 'copied 1 line' })).toBeDefined()
  await ui.unmount()
})

test('widths count emoji as two, combining marks as nothing', () => {
  expect(widthOf('✅')).toBe(2)
  expect(widthOf('✔️')).toBe(2)
  expect(widthOf('👨‍👩‍👧')).toBe(2)
  expect(widthOf('🇹🇼')).toBe(2)
  expect(widthOf('สวัสดี')).toBe(4)
  expect(widthOf('e\u0301')).toBe(1)
  expect(widthOf('「引號」')).toBe(8)
  expect(widthOf('ok')).toBe(2)
})

test('a reply is final when the closing line is the next thing after it', () => {
  const index = { finals: new Set<string>(), others: new Set<string>(), pending: null as string | null }
  fold(index, ['T a', 'D', 'T b', 'U', 'T c', 'T d', 'D', 'T e', 'P', 'T f'])
  expect([...index.finals]).toEqual(['a', 'd'])
  expect([...index.others]).toEqual(['b', 'c', 'e'])
  expect(index.pending).toBe('f')

  fold(index, ['D'])
  expect(index.finals.has('f')).toBe(true)
})

test('a final answer is drawn by the engine with the actions on its closing line', async ($, on) => {
  engine(on)

  const ui = await $.ui.mount(MESSAGE)
  expect(await ui.find({ type: 'Text', text: 'engine reply' })).toBeDefined()
  expect(await labels(ui)).toEqual(['⧉ Reply', '⧉ bash 1', '⧉ bash 2', '⧉ ts'])
  await ui.unmount()
})

test('a reply is not held while the transcript is read: its row comes after', async ($, on) => {
  const clock = mock.clock(on)
  const session = `slow-${++sessions}`
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine reply</Text>
  })
  on('session.id', () => ({ value: session }))
  on('env.get', () => ({ value: undefined }))
  // The scan answers only after half a second, as a long transcript's first read.
  on('process.run', async (_, e) => {
    const isLocate = e.argv.includes(session)
    if (!isLocate) await clock.sleep(500)
    const stdout = isLocate ? `/p/${session}.jsonl` : ['T msg-1', 'D', 'O 100'].join('\n')
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  // The draw does not wait on the scan: the reply is there, its row not yet.
  const ui = await $.ui.mount(MESSAGE)
  expect(await ui.find({ type: 'Text', text: 'engine reply' })).toBeDefined()
  expect(await ui.find({ type: 'Client' })).toBeUndefined()

  // Once the scan has answered, the reply draws again with its row.
  await clock.advance(500)
  expect(await labels(ui)).toEqual(['⧉ Reply', '⧉ bash 1', '⧉ bash 2', '⧉ ts'])
  await ui.unmount()
})

for (const [name, after] of [
  ['a tool call', AFTER.toolUse],
  ['more text', AFTER.moreText],
  ['the next prompt', AFTER.prompt],
  ['a turn still running', AFTER.running],
] as const) {
  test(`a reply followed by ${name} gets no actions`, async ($, on) => {
    engine(on, after)
    const ui = await $.ui.mount(MESSAGE)
    expect(await ui.find({ type: 'Client' })).toBeUndefined()
    await ui.unmount()
  })
}

test('an action copies its text, then its icon reads ✓ a moment', async ($, on) => {
  const clock = engine(on)
  const copied: string[] = []
  on('ui.copy', (_, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })

  const ui = await $.ui.mount(MESSAGE)
  await click(ui, 'copy-code:0')
  expect(copied).toEqual(['echo hi\nls -la'])
  expect((await item(ui, 'copy-code:0'))?.text).toBe('✓ bash 1')
  expect((await item(ui, 'copy-code:0'))?.tone).toBe('done')
  expect(await ui.find({ type: 'Text', text: 'copied 2 lines' })).toBeDefined()

  await clock.advance(1500)
  expect(await item(ui, 'copy-code:0')).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'copied 2 lines' })).toBeUndefined()

  await click(ui, 'copy-reply')
  expect(copied[1]).toBe(ANSWER)
  await ui.unmount()
})

test('rendered lays the reply out as the terminal draws it', () => {
  const markdown = [
    '## Plan',
    '',
    'Use **bold** and `code`, see [docs](https://d.x) or https://u.x.',
    '',
    '1. one',
    '   1. sub',
    '- [x] done',
    '',
    '> quoted',
    '',
    '| Name | 數量 |',
    '|:--|--:|',
    '| apple | 3 |',
    '| 香蕉 | 12 |',
    '',
    '```sh',
    'echo hi',
    '```',
  ].join('\n')
  expect(renderReply(markdown)).toBe(
    [
      'Plan',
      '',
      'Use bold and code, see docs (https://d.x) or https://u.x.',
      '',
      '1. one',
      '   a. sub',
      '- [x] done',
      '',
      '▎ quoted',
      '',
      '┌───────┬──────┐',
      '│ Name  │ 數量 │',
      '├───────┼──────┤',
      '│ apple │    3 │',
      '├───────┼──────┤',
      '│ 香蕉  │   12 │',
      '└───────┴──────┘',
      '',
      'echo hi',
    ].join('\n'),
  )
})

test('rendered follows the terminal\'s spacing, links and tables, as seen on screen', () => {
  // Each case was read off Claude Code's own drawing (dev/check-rendering.ts).
  const cases: [string, string][] = [
    // A heading is followed by a blank line; text and code on consecutive lines touch.
    ['## Title\nText\n```sh\nls\n```\nAfter', 'Title\n\nText\nls\nAfter'],
    // A table has a blank line around it, and columns three wide at least.
    [
      'x\n| a | b |\n|---|---|\n| 1 | |\n\nafter',
      'x\n\n┌─────┬─────┐\n│  a  │  b  │\n├─────┼─────┤\n│ 1   │     │\n└─────┴─────┘\n\nafter',
    ],
    // Entities stay as written.
    ['a &amp; b &lt;c&gt;', 'a &amp; b &lt;c&gt;'],
    // Reference links and their definitions stay as written.
    ['See [doc][d].\n\n[d]: https://d.x', 'See [doc][d].\n\n[d]: https://d.x'],
    // A titled link, an image with a title, an email.
    ['[a](https://a.x "T") ![i](https://i.x "P") <me@e.x>', 'a (https://a.x) ("T") i (https://i.x "P") me@e.x'],
    // A quote inside a list item sits at the left edge, as code does there.
    ['- item\n\n  > quoted', '- item\n\n▎ quoted'],
  ]
  for (const [markdown, drawn] of cases) expect(renderReply(markdown)).toBe(drawn)
})

test('the reply copies markdown, then rendered on a press while it reads ✓', async ($, on) => {
  engine(on)
  const copied: string[] = []
  on('ui.copy', (_, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  const text = '**Hi** there'
  const ui = await $.ui.mount({ ...MESSAGE, props: { text, isFirstOfReply: true } })

  await click(ui, 'copy-reply')
  expect(copied).toEqual([text])
  expect((await item(ui, 'copy-reply'))?.text).toBe('✓ Reply')
  expect((await item(ui, 'copy-reply'))?.tone).toBe('done')
  const said = await ui.find({ type: 'Text', text: 'copied as markdown' })
  const hint = await ui.find({ type: 'Text', text: ' · click again for rendered' })
  expect(said?.props.color).toBe('success')
  expect(hint?.props.dimColor).toBe(true)

  await click(ui, 'copy-reply')
  expect(copied).toEqual([text, 'Hi there'])
  expect(await ui.find({ type: 'Text', text: 'copied as rendered' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' · click again for markdown' })).toBeDefined()
  await ui.unmount()
})

test('the rendered reply format makes rendered the first copy', { options: { replyFormat: 'rendered' } }, async ($, on) => {
  engine(on)
  const copied: string[] = []
  on('ui.copy', (_, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  const ui = await $.ui.mount({ ...MESSAGE, props: { text: '`a`', isFirstOfReply: true } })
  await click(ui, 'copy-reply')
  expect(copied).toEqual(['a'])
  await ui.unmount()
})

const action = (label: string, isReply = false) => ({ key: label, label, text: '', isReply })
const ROW = [action('Reply', true), action('bash 1'), action('bash 2'), action('python'), action('javascript')]

test('labels are cut to the languages\' short names, renumbered where they repeat', () => {
  const short = abbreviate([...ROW, action('elixirlang')])
  expect(short.map(a => a.label)).toEqual(['Reply', 'sh 1', 'sh 2', 'py', 'js', 'elix'])
})

test('the row stays beside, then moves above, then cuts labels, then pages', () => {
  const labels = (r: ReturnType<typeof layoutRow>) => r.items.map(labelOf)
  // Whole: Reply 7, bash 1 8, bash 2 8, python 8, javascript 12, four gaps of 2 = 51.
  expect(layoutRow(ROW, 51, 51, 0)).toMatchObject({ isAbove: false, pages: 1 })
  expect(layoutRow(ROW, 50, 51, 0)).toMatchObject({ isAbove: true, pages: 1 })
  expect(labels(layoutRow(ROW, 50, 51, 0))).toEqual(['Reply', 'bash 1', 'bash 2', 'python', 'javascript'])
  // Short: Reply 7, sh 1 6, sh 2 6, py 4, js 4, four gaps = 35.
  expect(labels(layoutRow(ROW, 0, 35, 0))).toEqual(['Reply', 'sh 1', 'sh 2', 'py', 'js'])
  // Paged in 34: Reply, sh 1, sh 2 and `› 2 more` (7 + 6 + 6 + 8, three gaps = 33);
  // then `‹ back`, py, js.
  const first = layoutRow(ROW, 0, 34, 0)
  expect(first.pages).toBe(2)
  expect(labels(first)).toEqual(['Reply', 'sh 1', 'sh 2', '› 2 more'])
  expect(labels(layoutRow(ROW, 0, 34, 1))).toEqual(['‹ back', 'py', 'js'])
  // A page past the last shows the last.
  expect(labels(layoutRow(ROW, 0, 34, 9))).toEqual(['‹ back', 'py', 'js'])
})

test('a narrow terminal pages the row above the closing line', async ($, on) => {
  engine(on)
  const copied: string[] = []
  on('ui.copy', (_, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  // The blank row above has 25 columns: Reply, sh 1 and `› 2 more` (7 + 6 + 8,
  // two gaps); the short row whole would take 29.
  const ui = await $.ui.mount({ ...MESSAGE, viewport: { columns: 2 + 2 + 25, rows: 40 } })
  const labelsNow = async () => await labels(ui)
  expect(await labelsNow()).toEqual(['⧉ Reply', '⧉ sh 1', '› 2 more'])

  await click(ui, 'page-more')
  expect(await labelsNow()).toEqual(['‹ back', '⧉ sh 2', '⧉ ts'])
  await click(ui, 'copy-code:2')
  expect(copied).toEqual(['console.log(1)'])

  await click(ui, 'page-back')
  expect(await labelsNow()).toEqual(['⧉ Reply', '⧉ sh 1', '› 2 more'])
  await ui.unmount()
})

test('a failed copy says why in a toast, and nothing reads ✓', { options: { copiedNotice: 'above-prompt' } }, async ($, on) => {
  engine(on)
  const toasts: string[] = []
  on('ui.copy', () => ({ value: { isCopied: false, reason: 'no-clipboard' } }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  const ui = await $.ui.mount(MESSAGE)
  await click(ui, 'copy-code:0')
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toMatch(/^✗ couldn't copy: no clipboard reachable\. Over SSH, allow OSC 52/)
  expect((await item(ui, 'copy-code:0'))?.text).toBe('⧉ bash 1')
  await ui.unmount()
})

test('the row is its own region: a quick second click is a second press', async ($, on) => {
  engine(on)
  const copied: string[] = []
  on('ui.copy', (_, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  const text = '**Hi** there\n\n```sh\nls\n```'
  const ui = await $.ui.mount({ ...MESSAGE, props: { text, isFirstOfReply: true } })
  expect(await ui.find({ type: 'Client' })).toMatchObject({ key: 'row' })

  // What would be a double click elsewhere: two clicks on the reply, two presses.
  await click(ui, 'copy-reply')
  await click(ui, 'copy-reply')
  expect(copied).toEqual([text, 'Hi there\n\nls'])
  // A click between two items presses nothing.
  const [reply] = await rowOf(ui)
  await ui.pointer({ type: 'down', x: (reply?.to ?? 0) + 1, y: 0, button: 'left', in: 'row' })
  expect(copied).toHaveLength(2)
  await ui.unmount()
})

test('the row brightens the item under the pointer, but not one that reads ✓', async ($, on) => {
  engine(on)
  on('ui.copy', () => ({ value: { isCopied: true } }))
  const ui = await $.ui.mount(MESSAGE)
  const drawnText = async (text: string) => ui.find({ type: 'Text', text, in: 'row' })
  const reply = await item(ui, 'copy-reply')

  await ui.pointer({ type: 'move', x: reply?.from ?? 0, y: 0, in: 'row' })
  expect((await drawnText('⧉ Reply'))?.props.bold).toBe(true)
  expect((await drawnText('⧉ Reply'))?.props.dimColor).toBeUndefined()
  expect((await drawnText('⧉ Reply'))?.props.inverse).toBeUndefined()
  expect((await drawnText('⧉ bash 1'))?.props.dimColor).toBe(true)

  await click(ui, 'copy-reply')
  await ui.pointer({ type: 'move', x: reply?.from ?? 0, y: 0, in: 'row' })
  const copiedReply = await drawnText('✓ Reply')
  expect(copiedReply?.props.color).toBe('success')
  expect(copiedReply?.props.inverse).toBeUndefined()
  expect(copiedReply?.props.bold).toBeUndefined()

  await ui.pointer({ type: 'leave', x: 0, y: 0, in: 'row' })
  expect((await drawnText('⧉ bash 1'))?.props.dimColor).toBe(true)
  await ui.unmount()
})

test('the toast notice raises a toast instead of the line above the button', { options: { copiedNotice: 'toast' } }, async ($, on) => {
  engine(on)
  const toasts: string[] = []
  on('ui.copy', () => ({ value: { isCopied: true } }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })

  const ui = await $.ui.mount(MESSAGE)
  await click(ui, 'copy-code:2')
  expect(toasts).toEqual(['✓ copied 1 line to clipboard'])
  expect(await ui.find({ type: 'Text', text: /^copied \d+ lines?$/ })).toBeUndefined()
  expect((await item(ui, 'copy-code:2'))?.text).toBe('✓ ts')
  await click(ui, 'copy-code:0')
  expect(toasts[1]).toBe('✓ copied 2 lines to clipboard')
  await ui.unmount()
})

test('the above-prompt notice shows a green line above the prompt, then clears it', { options: { copiedNotice: 'above-prompt' } }, async ($, on) => {
  const clock = engine(on)
  on('ui.copy', () => ({ value: { isCopied: true } }))

  const BAND = {
    plugin: 'copy-buttons',
    component: 'AbovePrompt',
    requestId: 'band',
    surface: 'terminal',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  } as const
  const band = await $.ui.mount(BAND)
  expect(await band.find({ type: 'Text', text: /copied/ })).toBeUndefined()

  const ui = await $.ui.mount(MESSAGE)
  await click(ui, 'copy-code:2')
  const line = await band.find({ type: 'Text', text: '✓ copied 1 line to clipboard' })
  expect(line?.props.color).toBe('success')
  expect(await ui.find({ type: 'Text', text: /^copied \d+ lines?$/ })).toBeUndefined()

  await clock.advance(3000)
  expect(await band.find({ type: 'Text', text: /copied/ })).toBeUndefined()
  await ui.unmount()
  await band.unmount()
})

test('the nerd-font style draws the Nerd Font icon', { options: { icon: 'nerd-font' } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(MESSAGE)
  expect((await item(ui, 'copy-reply'))?.text).toBe('\u{F018F} Reply')
  await ui.unmount()
})

test('on Windows the transcript is read with PowerShell', async ($, on) => {
  useReader(null)
  const session = 'win-session'
  const argv: string[][] = []
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine reply</Text>
  })
  on('session.id', () => ({ value: session }))
  on('env.get', (_, e) => ({ value: { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\me' }[e.name] }))
  on('process.run', (_, e) => {
    argv.push([...e.argv])
    const isLocate = e.argv.some(arg => arg.includes('Get-ChildItem'))
    const path = `C:\\Users\\me\\.claude\\projects\\p\\${session}.jsonl`
    const stdout = isLocate ? btoa(path) : ['T msg-1', 'D', 'O 100'].join('\n')
    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  mock.clock(on)

  const ui = await $.ui.mount(MESSAGE)
  expect(await item(ui, 'copy-reply')).toBeDefined()
  expect(argv.map(a => a[0])).toEqual(['powershell.exe', 'powershell.exe'])
  expect(argv[0]?.at(-1)).toContain("'C:\\Users\\me\\.claude\\projects'")
  expect(argv[1]?.at(-1)).toContain(`p\\${session}.jsonl'`)
  await ui.unmount()
  useReader(null)
})

test('off fullscreen the reply draws without the row, and the session is told once', async ($, on) => {
  const clock = engine(on)
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  const offscreen = { columns: 120, rows: 40, isFullscreen: false }
  const ui = await $.ui.mount({ ...MESSAGE, viewport: offscreen })
  expect(await ui.find({ type: 'Text', text: 'engine reply' })).toBeDefined()
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  await clock.advance(0)
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toContain('"tui": "fullscreen"')

  const other = await $.ui.mount({ ...MESSAGE, requestId: 'msg-2', viewport: offscreen })
  await clock.advance(0)
  expect(toasts).toHaveLength(1)
  await ui.unmount()
  await other.unmount()
})

test('other surfaces keep the engine drawing alone', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...MESSAGE, surface: 'desktop' })
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  await ui.unmount()
})

// Rows as a terminal drew them, the reply's two columns of indent taken off.
test('a line wraps as the terminal wraps it: at spaces, a word wider than the row broken', () => {
  const printf = `printf '[popup]\\nview = "sidebar"\\n' > $d/config.toml   # 用 sidebar 模式，agent 才會在 popup 裡`
  expect(wrap(printf, 48).map(row => row.trimEnd())).toEqual([
    `printf '[popup]\\nview = "sidebar"\\n' >`,
    '$d/config.toml   # 用 sidebar 模式，agent 才會在',
    'popup 裡',
  ])
  const cat = 'cat ~/.local/state/tmux-agents/main.json'
  expect(wrap(cat, 38).map(row => row.trimEnd())).toEqual(['cat', '~/.local/state/tmux-agents/main.json'])
  expect(wrap(cat, 28)).toEqual(['cat ~/.local/state/tmux-agen', 'ts/main.json'])
})

test('a reply lays out as the terminal draws it: list rows under their text, code flush', () => {
  const markdown = [
    '1. `C-a ,` 把目前的 window 改名成 `api`。',
    '2. `C-a Space` 打開 popup，在裡面跑 `claude`，**問它一句話並等它回答**。沒有任何對話的 session 可能沒辦法 resume。',
    '   - 想多試幾個的話，在 popup 裡按 `C-a c` 再開一個 agent。',
    '3. 從另一個終端機確認有記下來：',
    '   ```sh',
    '   cat ~/.local/state/tmux-agents/main.json',
    '   ```',
    '   裡面應該有 `"window": "api"`。',
  ].join('\n')
  const layout = layOut(markdown, 50)
  expect(layout.rows.map(row => row.trimEnd())).toEqual([
    '1. C-a , 把目前的 window 改名成 api。',
    '2. C-a Space 打開 popup，在裡面跑',
    '   claude，問它一句話並等它回答。沒有任何對話的',
    '   session 可能沒辦法 resume。',
    '   - 想多試幾個的話，在 popup 裡按 C-a c',
    '     再開一個 agent。',
    '3. 從另一個終端機確認有記下來：',
    'cat ~/.local/state/tmux-agents/main.json',
    '   裡面應該有 "window": "api"。',
  ])
  expect(layout.codeStarts).toEqual([7])
  expect(layout.codeEnds).toEqual([7])
})

test('a code block in a quote counts, and a block ends where the next one starts', () => {
  const markdown = ['> ```sh', '> echo quoted', '> ```', '', '    indented code block', '', '```diff', '- old', '+ new', '```'].join('\n')
  const layout = layOut(markdown, 80)
  expect(layout.rows).toEqual(['▎ echo quoted', '', 'indented code block', '- old', '+ new'])
  expect(layout.codeStarts).toEqual([0, 2, 3])
  expect(layout.codeEnds).toEqual([0, 2, 4])
})

const SIZES = { whole: 8, compact: 2 }

test('a block button sits past the widest row, else at the right, else as its icon', () => {
  const layout = { rows: ['short', 'a much longer row of code', 'x'.repeat(40)], codeStarts: [0, 2], codeEnds: [1, 2] }
  const codes = ['short\na much longer row of code', 'x'.repeat(40)]
  // Wide: each past its own widest row, its card ending a column after it.
  expect(placeBlocks(layout, codes, 80, SIZES)).toEqual([
    { index: 0, top: 1, rows: ['short', 'a much longer row of code'], right: 38, isCompact: false, pastWidest: 29 },
    { index: 1, top: 3, rows: ['x'.repeat(40)], right: 53, isCompact: false, pastWidest: 44 },
  ])
  // Narrower: the long block's icon alone past it; narrower still, over its end.
  expect(placeBlocks(layout, codes, 50, SIZES)[1]).toMatchObject({ right: 47, isCompact: true, pastWidest: 44 })
  const covering = placeBlocks(layout, codes, 45, SIZES)[1]
  expect(covering).toMatchObject({ right: 45, isCompact: true })
  expect(placeOn(covering!, 0, 45, SIZES)).toEqual({ at: 42, isCompact: true, isOver: true })
  // An empty block gets none.
  expect(placeBlocks(layout, ['', ''], 80, SIZES)).toEqual([])
})

// Each as the terminal drew it.
test('a tab in code runs to the next multiple of eight from where the code starts', () => {
  const code = 'func worker() {\n\tfor j := range jobs {\n\t\tresults <- j\n\t}\n}'
  const layout = layOut(['```go', code, '```'].join('\n'), 80)
  expect(layout.rows).toEqual(['func worker() {', '        for j := range jobs {', '                results <- j', '        }', '}'])
  expect(placeBlocks(layout, [code], 80, SIZES)).toHaveLength(1)

  const rows = (markdown: string) => layOut(markdown, 80).rows.map(row => row.trimEnd())
  expect(rows('```\nname\tage\nabcdefgh\t22\nab\tc\td\n```')).toEqual(['name    age', 'abcdefgh        22', 'ab      c       d'])
  // Past a quote's bar, and a wide character two columns.
  expect(rows('> ```\n> ab\tc\n> abcdefghij\td\n> ```')).toEqual(['▎ ab      c', '▎ abcdefghij      d'])
  expect(rows('```\n中文\tx\n中文字\ty\n```')).toEqual(['中文    x', '中文字  y'])
})

test('a block as wide as the screen has its button at the right of the row it is drawn on', () => {
  const layout = { rows: ['ab', 'y'.repeat(37)], codeStarts: [0], codeEnds: [1] }
  const [block] = placeBlocks(layout, ['ab\n' + 'y'.repeat(37)], 40, SIZES)
  expect(block).toMatchObject({ right: 40, isCompact: false })
  expect(block?.pastWidest).toBeUndefined()
  // Whole where the row leaves room; over the end of a row that leaves none.
  expect(placeOn(block!, 0, 40, SIZES)).toEqual({ at: 31, isCompact: false, isOver: false })
  expect(placeOn(block!, 1, 40, SIZES)).toEqual({ at: 37, isCompact: true, isOver: true })
})

test('a block is drawn only as far as it shows on screen', () => {
  const block = { index: 0, top: 5, rows: ['a', 'b', 'c', 'd'], right: 10, isCompact: false }
  expect(onScreenPart(block, { first: 0, last: 100 })).toEqual({ from: 5, lines: ['a', 'b', 'c', 'd'] })
  expect(onScreenPart(block, { first: 7, last: 100 })).toEqual({ from: 7, lines: ['c', 'd'] })
  expect(onScreenPart(block, { first: 0, last: 6 })).toEqual({ from: 5, lines: ['a', 'b'] })
  expect(onScreenPart(block, { first: 9, last: 100 })).toBeUndefined()
  expect(onScreenPart(block, null)).toBeUndefined()
  expect(onScreenPart(block, undefined)).toEqual({ from: 5, lines: ['a', 'b', 'c', 'd'] })
})

// ANSWER on a screen 61 columns wide: its eight rows and the blank row above.
const HOVERED = { ...MESSAGE, viewport: { columns: 61, rows: 40 } }
const onScreen = (of: number) => ({ ...MESSAGE.props, onScreen: { first: 0, last: of - 1, of } })
const blockButton = async (ui: Mounted, key: string) =>
  ((await ui.find({ type: 'Client', key }))?.props.props as RowProps | undefined)?.items[0]?.text
const rowLabels = async (ui: Mounted) =>
  (((await ui.find({ type: 'Client', key: 'row' }))?.props.props as RowProps | undefined)?.items ?? []).map(one => one.text)

test('each code block gets its own button once the engine agrees on the reply\'s height', async ($, on) => {
  engine(on)
  const copied: string[] = []
  on('ui.copy', (_, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  const ui = await $.ui.mount({ ...HOVERED, props: onScreen(9) })
  expect(await rowLabels(ui)).toEqual(['⧉ Reply'])
  expect(await blockButton(ui, 'copy-code:1')).toBe('⧉ copy')

  await ui.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'copy-code:1' })
  expect(copied).toEqual(['pwd'])
  expect(await blockButton(ui, 'copy-code:1')).toBe('✓ copied')
  // A plain ✓ under the mark, seen once the pointer leaves the block.
  expect(await blockButton(ui, 'copy-code:1:copied')).toBe('✓ copied')
  await ui.unmount()
})

test('a reply whose height the engine does not agree on keeps its blocks on the row', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...HOVERED, props: onScreen(12) })
  expect(await rowLabels(ui)).toEqual(['⧉ Reply', '⧉ bash 1', '⧉ bash 2', '⧉ ts'])
  expect(await ui.find({ type: 'Client', key: 'copy-code:0' })).toBeUndefined()
  await ui.unmount()
})

test('the bar mark draws a bar beside the block instead of a card', { options: { blockHover: 'bar' } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...HOVERED, props: onScreen(9) })
  expect(await ui.find({ type: 'Text', text: '▎' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'pwd' })).toBeUndefined()
  await ui.unmount()
})

test('the highlight mark redraws the block\'s rows on a card', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...HOVERED, props: onScreen(9) })
  expect(await ui.find({ type: 'Text', text: 'pwd' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '▎' })).toBeUndefined()
  await ui.unmount()
})

test('with the hover off every block keeps its button on the row', { options: { blockHover: 'off' } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...HOVERED, props: onScreen(9) })
  expect(await rowLabels(ui)).toEqual(['⧉ Reply', '⧉ bash 1', '⧉ bash 2', '⧉ ts'])
  expect(await ui.find({ type: 'Client', key: 'copy-code:0' })).toBeUndefined()
  await ui.unmount()
})
