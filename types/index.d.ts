// What a copy takes: the reply as Claude wrote it, the reply or a table laid
// out as the terminal draws it, or a table as a spreadsheet pastes it.
export type Format = 'markdown' | 'rendered' | 'spreadsheet'

// The action that last copied (`<message requestId>:<action key>`); for one
// with two formats, the format it took and the one its next press takes; and
// when, so a later copy's ✓ is not cleared by an earlier one's timer.
export type Copied = { id: string; format?: Format; other?: Format; stamp: number }

declare module 'claude-code' {
  interface PluginState {
    // `pages`: the page a paged row shows, by the reply's requestId.
    // `toldFullscreen`: whether this session was told the buttons need fullscreen.
    'copy-buttons': {
      copied: Copied | null
      pages: Record<string, number>
      toldFullscreen: boolean
    }
  }
}
