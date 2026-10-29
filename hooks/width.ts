// Terminal columns a text takes, counted by grapheme (what draws as one
// character): an emoji is two, an East Asian wide or fullwidth character two,
// a mark that combines with the one before it (Thai vowels, accents)
// nothing, the rest one.

const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter() : undefined

// What draws as one character each, in order.
export const graphemes = (text: string): Iterable<string> =>
  segmenter === undefined ? Array.from(text) : Array.from(segmenter.segment(text), part => part.segment)

// Drawn as an emoji: a character shown as one by default, one a variation
// selector asks to be (`✔️`), a sequence joined by ZWJ, or a flag's pair.
const EMOJI = /\p{Emoji_Presentation}|️|‍|\p{Regional_Indicator}/u
// Nothing on screen: a mark combining with what precedes it, a zero-width
// format character, a control character.
const ZERO = /^[\p{Mn}\p{Me}\p{Cf}\p{Cc}]+$/u

function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0x303e) ||
    (code >= 0x3041 && code <= 0x33ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xa000 && code <= 0xa4cf) ||
    (code >= 0xa960 && code <= 0xa97f) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1b000 && code <= 0x1b2ff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  )
}

function widthOfGrapheme(grapheme: string): number {
  if (ZERO.test(grapheme)) return 0
  if (EMOJI.test(grapheme)) return 2
  return isWide(grapheme.codePointAt(0) ?? 0) ? 2 : 1
}

export function widthOf(text: string): number {
  let cells = 0
  for (const grapheme of graphemes(text)) cells += widthOfGrapheme(grapheme)
  return cells
}
