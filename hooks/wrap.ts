import { renderLines } from './render'
import { graphemes, widthOf } from './width'

// Where each row of a reply lands on the screen, so a code block's button
// can be drawn on it. Each rule below was taken from the terminal's drawing
// (`dev/check-rendering.ts` compares the two at a width that wraps nothing).

// A word wider than the row, broken where the row ends.
function breakWord(rows: string[], word: string, columns: number) {
  for (const grapheme of graphemes(word)) {
    const last = rows.length - 1
    if (widthOf((rows[last] ?? '') + grapheme) > columns) rows.push(grapheme)
    else rows[last] += grapheme
  }
}

// A line wrapped at `columns` as the terminal wraps it: at spaces, a word
// wider than the row broken where the row ends (on a row of its own when that
// breaks it no more often), each row after the first without its leading
// spaces.
export function wrap(text: string, columns: number): string[] {
  if (columns <= 0) return [text]
  const rows = ['']
  text.split(' ').forEach((word, i) => {
    let used = widthOf(rows.at(-1) ?? '')
    const width = widthOf(word)
    if (i !== 0) {
      if (used >= columns) {
        rows.push('')
        used = 0
      }
      rows[rows.length - 1] += ' '
      used++
    }
    if (width > columns) {
      const left = columns - used
      if (Math.floor((width - 1) / columns) < 1 + Math.floor((width - left - 1) / columns)) rows.push('')
      breakWord(rows, word, columns)
      return
    }
    if (used + width > columns && used > 0 && width > 0) rows.push('')
    rows[rows.length - 1] += word
  })
  return rows.map((row, i) => (i === 0 ? row : row.trimStart()))
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

// The reply's rows on a screen `columns` wide, past its bullet's two columns,
// and the first and last row of each code block. A table wider than the
// screen, which the terminal narrows, is not followed: the rows are trusted
// only while their count is the engine's.
export type Layout = { rows: string[]; codeStarts: number[]; codeEnds: number[] }

export function layOut(markdown: string, columns: number): Layout {
  const width = columns - 2
  const layout: Layout = { rows: [], codeStarts: [], codeEnds: [] }
  const isCode: boolean[] = []
  for (const drawn of renderLines(markdown)) {
    const line = drawn.isCode === true ? { ...drawn, text: untab(drawn.text, drawn.codeAt ?? 0) } : drawn
    const hang = line.isFlush === true ? 0 : (line.hang ?? 0)
    if (line.isCodeStart === true) layout.codeStarts.push(layout.rows.length)
    wrap(line.text.slice(hang), width - hang).forEach((row, i) => {
      layout.rows.push((i === 0 ? line.text.slice(0, hang) : ' '.repeat(hang)) + row)
      isCode.push(line.isCode === true)
    })
  }
  // A block ends at its last code row before the next block starts.
  layout.codeEnds = layout.codeStarts.map((start, n) => {
    const next = layout.codeStarts[n + 1] ?? layout.rows.length
    let end = start
    while (end + 1 < next && isCode[end + 1] === true) end++
    return end
  })
  return layout
}
