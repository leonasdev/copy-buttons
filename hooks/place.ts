import { GAP } from './fit'
import { widthOf } from './width'
import type { Layout } from './wrap'

// The columns a code block's button takes: whole (`⧉ copy`, with room for
// `✓ copied`), or as its icon alone with a space after it.
export type ButtonSizes = { whole: number; compact: number }

// A code block that gets a button of its own: which of the reply's code
// blocks it is, the row it starts on (the reply's row k is drawn at k + 1,
// below the blank row), its rows as drawn, and the column its card ends at,
// from the reply's left edge; `isCompact` where the button is its icon
// alone, and `pastWidest`, where the button sits past the block's widest
// row, the column it starts at on whichever row it is drawn. Else it sits at
// the screen's right.
export type Block = { index: number; top: number; rows: string[]; right: number; isCompact: boolean; pastWidest?: number }

// Columns a row of the reply takes, its two of indent counted and the space
// a wrap leaves at its end not.
const used = (row: string) => 2 + widthOf(row.trimEnd())

// Whether a button `width` wide fits at the screen's right of a row, a gap
// after the row's text and a column after the button.
const fitsAtRight = (row: string, width: number, columns: number) => used(row) + GAP <= columns - 1 - width

// Each code block's button on its first row: past its widest row, where the
// screen has room for it and a column after; else, its card as wide as the
// screen, at the screen's right, where the row leaves room; then the same as
// its icon alone; failing those, as its icon over the row's end (`placeOn`).
// An empty block has nothing to copy; a tab is drawn as the terminal
// pleases, so a block holding one is not redrawn: neither gets a button.
export function placeBlocks(layout: Layout, codes: readonly string[], columns: number, sizes: ButtonSizes): Block[] {
  return layout.codeStarts.flatMap((start, index): Block[] => {
    const code = codes[index]
    if (code === undefined || code === '' || code.includes('\t')) return []
    const rows = layout.rows.slice(start, (layout.codeEnds[index] ?? start) + 1)
    const block = { index, top: start + 1, rows }
    const pastWidest = Math.max(...rows.map(used)) + GAP
    for (const [isCompact, width] of [[false, sizes.whole], [true, sizes.compact]] as const) {
      if (pastWidest + width + 1 <= columns) return [{ ...block, right: pastWidest + width + 1, isCompact, pastWidest }]
      if (fitsAtRight(rows[0] ?? '', width, columns)) return [{ ...block, right: columns, isCompact }]
    }
    return [{ ...block, right: columns, isCompact: true }]
  })
}

// Where a block's button goes on one of its rows (the first on screen):
// past its widest, where it was placed so; else at the screen's right, where
// the row leaves room; else as its icon alone over the row's end, a space
// before it (`isOver`), the two taking the screen's last columns.
export function placeOn(block: Block, row: number, columns: number, sizes: ButtonSizes) {
  if (block.pastWidest !== undefined) return { at: block.pastWidest, isCompact: block.isCompact, isOver: false }
  const width = block.isCompact ? sizes.compact : sizes.whole
  if (fitsAtRight(block.rows[row] ?? '', width, columns)) return { at: columns - 1 - width, isCompact: block.isCompact, isOver: false }
  return { at: columns - 1 - sizes.compact, isCompact: true, isOver: true }
}

// The part of a block on screen: its first row there (`from`, as `top`
// counts) and its rows from it; none while the reply is off screen (`null`)
// or the block is scrolled past. A surface that does not say counts it all.
export function onScreenPart(block: Block, onScreen: { first: number; last: number } | null | undefined) {
  if (onScreen === null) return undefined
  const from = Math.max(block.top, onScreen?.first ?? block.top)
  const to = Math.min(block.top + block.rows.length - 1, onScreen?.last ?? Infinity)
  if (to < from) return undefined
  return { from, lines: block.rows.slice(from - block.top, to - block.top + 1) }
}
