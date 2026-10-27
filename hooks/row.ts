import type { ClientModule } from 'claude-code'

// One thing on the row as the hooks module laid it out: its text, the columns
// it spans (`from` inclusive, `to` exclusive, gaps not included), and how it
// reads: a copy action at rest, one whose copy just landed, or a page button.
export type RowItem = { key: string; text: string; from: number; to: number; tone: 'idle' | 'done' | 'page' }
export type RowProps = { items: RowItem[]; gap: number }

// What the row posts to the hooks module: the item a click landed on.
export type RowPress = { key: string }

type RowState = { hovered: string | null }

// The row of copy actions, drawn in a region of its own: the pointer there is
// this module's, so the engine neither selects nor copies the words under a
// click, nor a double click's word. Every click is a press, a quick second
// one too. An item under the pointer inverts, as a Button does, unless its
// copy just landed: that one reads plain green.
const Row: ClientModule<RowProps, RowState> = (props, surface) => {
  const { Box, Text } = surface.elements
  const hovered = surface.state?.hovered ?? null
  const at = (x: number) => props.items.find(item => x >= item.from && x < item.to)

  surface.onPointer(event => {
    if (event.type === 'down' && event.button === 'left') {
      const item = at(event.x)
      if (item !== undefined) surface.post({ key: item.key } satisfies RowPress)
      return
    }
    const next = event.type === 'leave' ? null : (at(event.x)?.key ?? null)
    if (next !== hovered) surface.setState({ hovered: next })
  })

  return Box({
    flexDirection: 'row',
    children: props.items.flatMap((item, i) => {
      const isHovered = item.key === hovered && item.tone !== 'done'
      const text =
        item.tone === 'done'
          ? Text({ color: 'success', children: item.text })
          : Text({ dimColor: !isHovered, inverse: isHovered ? true : undefined, children: item.text })
      return i === 0 ? [text] : [Text({ children: ' '.repeat(props.gap) }), text]
    }),
  })
}

export default Row
