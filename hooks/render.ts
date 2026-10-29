import { Lexer, Tokenizer } from './vendor/marked.js'
import type { Token, Tokens } from './vendor/marked.js'

import { widthOf } from './width'

// Lays a reply's Markdown out as text the way the terminal draws it, minus
// the wrapping at the screen's width: what the person sees, to paste where
// Markdown is not read. Each rule below was taken from the terminal's drawing.

// A rendered line; `isFlush` keeps it at the left edge inside a list, where
// the terminal draws code blocks and quotes unindented. `hang` is where its
// wrapped rows start (past a list item's marker); `isCode` marks a code
// block's line, `isCodeStart` its first, and `codeAt` is where its code
// starts (past a quote's `▎ `).
export type Line = { text: string; isFlush?: true; hang?: number; isCode?: true; isCodeStart?: true; codeAt?: number }

// Inline marks are dropped (`**`, `*`, backticks), entities left as written
// (`&amp;`); a link reads `text (url)`, `text (url) ("title")` with a title,
// or the url alone where the text is it (an email: the address); a reference
// link, which the terminal does not resolve, stays as written; `~~` stays.
function inline(tokens: readonly Token[] | undefined): string {
  if (tokens === undefined) return ''
  return tokens
    .map(token => {
      switch (token.type) {
        case 'strong':
        case 'em':
          return inline(token.tokens)
        case 'codespan':
          return token.text
        case 'del':
          return token.raw
        case 'br':
          return '\n'
        case 'link': {
          if (!token.raw.includes('](') && !token.raw.startsWith('<') && token.raw !== token.href) return token.raw
          const text = inline(token.tokens)
          if (text === token.href || `mailto:${text}` === token.href) return text
          return `${text} (${token.href})${token.title ? ` ("${token.title}")` : ''}`
        }
        case 'image':
          return `${token.text} (${token.href}${token.title ? ` "${token.title}"` : ''})`
        case 'text':
          return 'tokens' in token && token.tokens !== undefined ? inline(token.tokens) : token.text
        default:
          return 'text' in token && typeof token.text === 'string' ? token.text : token.raw
      }
    })
    .join('')
}

const toLines = (text: string): Line[] => text.split('\n').map(line => ({ text: line }))

// Ordered lists count 1., a., i. by depth, then start over.
function ordinal(n: number, depth: number): string {
  const kind = depth % 3
  if (kind === 1) return String.fromCharCode(96 + (((n - 1) % 26) + 1))
  if (kind === 2) {
    const romans: [number, string][] = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]
    let rest = n
    let out = ''
    for (const [value, numeral] of romans) {
      while (rest >= value) {
        out += numeral
        rest -= value
      }
    }
    return out
  }
  return String(n)
}

function list(token: Tokens.List, depth: number): Line[] {
  const lines: Line[] = []
  const start = typeof token.start === 'number' ? token.start : 1
  token.items.forEach((item, i) => {
    const marker = token.ordered ? `${ordinal(start + i, depth)}.` : '-'
    const lead = `${marker} ${item.task ? `[${item.checked ? 'x' : ' '}] ` : ''}`
    const pad = ' '.repeat(marker.length + 1)
    const body = blocks(item.tokens, depth + 1)
    body.forEach((line, j) => {
      const hang = pad.length + (line.hang ?? 0)
      if (j === 0) lines.push({ ...line, text: lead + line.text, hang })
      else if (line.isFlush === true || line.text === '') lines.push(line)
      else lines.push({ ...line, text: pad + line.text, hang })
    })
  })
  return lines
}

// Each cell padded by one, each column three wide at least; the header
// centered, the body as the column aligns; a rule between every two rows.
function table(token: Tokens.Table): Line[] {
  const header = token.header.map(cell => inline(cell.tokens))
  const rows = token.rows.map(row => row.map(cell => inline(cell.tokens)))
  const widths = header.map((text, c) => Math.max(3, widthOf(text), ...rows.map(row => widthOf(row[c] ?? ''))))

  const place = (text: string, width: number, align: string | null) => {
    const room = width - widthOf(text)
    if (align === 'right') return ' '.repeat(room) + text
    if (align === 'center') return ' '.repeat(Math.floor(room / 2)) + text + ' '.repeat(Math.ceil(room / 2))
    return text + ' '.repeat(room)
  }
  const rule = (left: string, mid: string, right: string) =>
    left + widths.map(width => '─'.repeat(width + 2)).join(mid) + right
  const row = (cells: string[], align: (c: number) => string | null) =>
    `│${cells.map((text, c) => ` ${place(text, widths[c] ?? 0, align(c))} `).join('│')}│`

  const lines = [rule('┌', '┬', '┐'), row(header, () => 'center')]
  for (const cells of rows) {
    lines.push(rule('├', '┼', '┤'), row(cells, c => token.align[c] ?? null))
  }
  lines.push(rule('└', '┴', '┘'))
  return lines.map(text => ({ text }))
}

function block(token: Token, depth: number): Line[] {
  switch (token.type) {
    case 'heading':
    case 'paragraph':
      return toLines(inline(token.tokens))
    case 'text':
      return toLines('tokens' in token && token.tokens !== undefined ? inline(token.tokens) : token.text)
    case 'code':
      return toLines(token.text).map((line, i) => ({
        ...line,
        isFlush: true as const,
        isCode: true as const,
        ...(i === 0 ? { isCodeStart: true as const } : {}),
      }))
    case 'hr':
      return [{ text: '---' }]
    case 'blockquote':
      return blocks(token.tokens, depth).map(line => ({
        ...line,
        text: line.text === '' ? '▎' : `▎ ${line.text}`,
        isFlush: true as const,
        ...(line.isCode === true ? { codeAt: (line.codeAt ?? 0) + 2 } : {}),
      }))
    case 'list':
      return list(token as Tokens.List, depth)
    case 'table':
      return table(token as Tokens.Table)
    case 'space':
      return []
    default:
      return toLines(token.raw.replace(/\n+$/, ''))
  }
}

// Blocks in order, one blank line between two where the Markdown has blank
// lines between them, after a heading, and around a table; two blocks
// written on consecutive lines (a paragraph and the code under it) touch.
function blocks(tokens: readonly Token[] | undefined, depth: number): Line[] {
  const lines: Line[] = []
  let previous: Token | undefined
  let isApart = false
  for (const token of tokens ?? []) {
    if (token.type === 'space') {
      isApart = true
      continue
    }
    const drawn = block(token, depth)
    if (drawn.length === 0) continue
    const isSpaced = isApart || previous?.type === 'heading' || previous?.type === 'table' || token.type === 'table'
    if (previous !== undefined && isSpaced) lines.push({ text: '' })
    lines.push(...drawn)
    previous = token
    isApart = false
  }
  return lines
}

// The terminal reads no link definitions (`[r1]: https://…`): they stay as
// text, and the reference links they would resolve stay as written.
class NoDefinitions extends Tokenizer {
  override def(): undefined {
    return undefined
  }
}

// A table alone, laid out as the terminal draws it.
export const renderTable = (token: Tokens.Table): string => table(token).map(line => line.text).join('\n')

// The reply's tokens as the terminal reads them.
export const lex = (markdown: string): Token[] => new Lexer({ gfm: true, tokenizer: new NoDefinitions() }).lex(markdown)

// A table as a spreadsheet pastes it: a tab between cells, a newline between
// rows, each cell's text as the reply reads (marks dropped, a link with its
// url); a cell holding a tab, a newline or a quote is quoted, quotes doubled.
export function tsvOf(token: Tokens.Table): string {
  const cell = (text: string) => (/[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text)
  const row = (cells: readonly Tokens.TableCell[]) => cells.map(c => cell(inline(c.tokens))).join('\t')
  return [row(token.header), ...token.rows.map(row)].join('\n')
}

export function renderReply(markdown: string): string {
  const tokens = lex(markdown)
  return blocks(tokens, 0)
    .map(line => line.text.replace(/\s+$/, ''))
    .join('\n')
}

// The reply's lines as `renderReply` lays them out, with what the wrapping
// at the screen's width needs.
export const renderLines = (markdown: string): Line[] => blocks(lex(markdown), 0)
