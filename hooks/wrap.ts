import { asPart, renderLines } from './render'
import type { Line } from './render'
import { fitted } from './table'
import { graphemes, widthOf, wrapAnsi } from './width'

// Where each row of a reply lands on the screen, so a code block's button
// can be drawn on it. Each rule below was taken from the terminal's drawing
// (`dev/check-rendering.ts` compares the two at a width that wraps nothing).

// A line wrapped at `columns` as the terminal wraps it: at spaces, a word
// wider than the row broken where the row ends (on a row of its own when that
// breaks it no more often), each row after the first without the one space
// it starts with, where more than spaces follows.
export function wrap(text: string, columns: number): string[] {
  if (columns <= 0) return [text]
  return wrapAnsi(text, columns, true).map((row, i) =>
    i > 0 && row.startsWith(' ') && widthOf(row.slice(1)) > 0 ? row.slice(1) : row,
  )
}

// A tab in a code line runs to the next multiple of eight columns, counted
// from where the code starts (past a quote's `▎ `), a wide character two.
const TAB_STOP = 8

function untab(text: string, from: number): string {
  let out = text.slice(0, from)
  let column = 0
  for (const grapheme of graphemes(text.slice(from))) {
    const width = grapheme === '\t' ? TAB_STOP - (column % TAB_STOP) : widthOf(grapheme)
    out += grapheme === '\t' ? ' '.repeat(width) : grapheme
    column += width
  }
  return out
}

// The reply's lines, each table drawn in boxes as the terminal fits it to a
// screen `columns` wide.
const fit = (lines: readonly Line[], columns: number): Line[] =>
  lines.flatMap(line => (line.grid === undefined ? [line] : asPart(fitted(line.grid, columns), 'table')))

// The reply's rows on a screen `columns` wide, past its bullet's two columns,
// and its code blocks and tables in reading order, each by its first and
// last row. The rows are trusted only while their count is the engine's.
export type Span = { kind: 'code' | 'table'; start: number; end: number }
export type Layout = { rows: string[]; parts: Span[] }

// A quote's line wraps inside its bar, each row starting with the bar; any
// other line's wrapped rows start at its `hang`, blank before it.
const QUOTE_BAR = 2

// A list item on a screen `columns` wide has the room less fourteen for its
// indent and marker: its indent kept to the room less two, its marker's cell
// to what is left, two at least (a marker that no longer fits loses its
// space). Else its line is as drawn.
function inRoom(line: Line, columns: number): Line {
  if (line.item === undefined) return line
  const { indent, cell, marker } = line.item
  const room = columns - 14
  const before = Math.max(0, Math.min(indent, room - 2))
  const own = Math.max(2, Math.min(cell, room - before))
  if (before === indent && own === cell) return line
  const lead = ' '.repeat(before) + (marker === undefined ? ' '.repeat(own) : marker.padEnd(own))
  return { ...line, text: lead + line.text.slice(indent + cell), hang: before + own + (line.hang ?? 0) - indent - cell }
}

export function layOut(markdown: string, columns: number): Layout {
  const width = columns - 2
  const layout: Layout = { rows: [], parts: [] }
  const kinds: (Span['kind'] | undefined)[] = []
  for (const drawn of fit(renderLines(markdown), columns)) {
    const line = drawn.part === 'code' ? { ...drawn, text: untab(drawn.text, drawn.codeAt ?? 0) } : inRoom(drawn, columns)
    const hang = line.isQuote === true ? QUOTE_BAR : line.isFlush === true ? 0 : (line.hang ?? 0)
    if (line.part !== undefined && line.isPartStart === true) {
      layout.parts.push({ kind: line.part, start: layout.rows.length, end: layout.rows.length })
    }
    wrap(line.text.slice(hang), width - hang).forEach((row, i) => {
      layout.rows.push((i === 0 || line.isQuote === true ? line.text.slice(0, hang) : ' '.repeat(hang)) + row)
      kinds.push(line.part)
    })
  }
  // A part ends at its last row of its kind before the next part starts.
  layout.parts.forEach((part, n) => {
    const next = layout.parts[n + 1]?.start ?? layout.rows.length
    while (part.end + 1 < next && kinds[part.end + 1] === part.kind) part.end++
  })
  return layout
}
