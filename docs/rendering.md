# How Claude Code draws a reply, and what the plugin relies on

Facts the hover buttons depend on, each checked against Claude Code 2.1.312 on a
real screen (tmux, see `manual-testing.md`) unless marked otherwise. A Claude
Code update can change any of them; the guard in `hooks/register.tsx` (height
and parts must match) keeps a wrong guess from drawing a button on a wrong row.

## The reply's rows

- A reply is drawn two columns in (`● ` on its first row), so its text has
  `columns - 2` cells.
- Lines wrap as wrap-ansi wraps them: at spaces, a word wider than the row
  broken where the row ends. Rows after the first lose their leading spaces.
  `hooks/wrap.ts` `wrap()` follows this; `tests/` holds rows taken from screens.
- A list item's wrapped rows start under its text (past `1. ` or `- `); nested
  items add their own marker's width.
- Code blocks are drawn flush: no indent inside a list item, and their wrapped
  rows start at column 0 of the reply too.
- A code block written right after a paragraph or a list item's text touches it
  (no blank row between). Two code blocks can touch too (an indented block, a
  blank line, then a fence).
- A quote's lines read `▎ ` + the line; an empty quote line is `▎`.
- Tabs in code run to the next multiple of 8 columns, counted from where the
  code starts (past a quote's `▎ `), a wide character counting 2.
- `mermaid` fences are drawn as diagrams, not as code: the layout does not
  follow them, so a reply holding one keeps its buttons on the closing line.

## Tables

A table that fits is drawn as `hooks/render.ts` `table()` lays it out: each
column as wide as its widest cell (3 at least), the header centered, a rule
between every two rows.

It fits when its width is at most `columns - 4` (not `columns - 2`). Past that,
Claude Code narrows it; this is **not yet followed** by the plugin. The rules,
read from Claude Code's own table component (2.1.312):

- Per column: an ideal width (its widest cell) and a minimum width (its longest
  word), both at least 3.
- Room for the cells: `columns - (1 + 3 × columnCount) - 4`, but at least
  `3 × columnCount`.
- If the ideal widths fit, they are used. Else, if the minimum widths fit, each
  column gets its minimum plus `floor(share × spare)`, `share` its ideal minus
  minimum over the sum of those. Else each gets `max(floor(minimum × room /
  sumOfMinimums), 3)` and words may be broken (`hard`).
- Each cell wraps at its column's width (wrap-ansi, `trim: false`, word wrap,
  empty rows dropped). A row is as tall as its tallest cell; shorter cells are
  centered vertically (`floor((tall - own) / 2)` blank rows above).
- If any cell takes more than 4 rows, or the drawn table is still wider than
  `columns - 4`, the table is drawn vertically instead: for each data row,
  `Header: value` lines (the header bold), long values wrapped, rows separated
  by a rule of `─` `min(columns - 1, 40)` long. These lines are made for the
  full `columns` and may wrap again in the reply's `columns - 2` (unverified).
- At most 200 data rows are drawn, then `… N more rows not shown`.
- A table inside a list item or a quote takes another path, not yet read.

## What a render hook gets and may draw

- `e.props.onScreen` (`{ first, last, of }`): rows of the message's site,
  row 0 being the blank row the engine draws above it. `of` is the reply's rows
  plus 1. `first`/`last` are the rows the viewport shows; it is absent before
  the first draw and `null` while off screen.
- An engine node may not sit under a Box with `position`: the plugin draws a
  zero-height relative Box before the reply (hover scopes) and one after it
  (marks and buttons, at negative `top`).
- An absolutely placed Box past the rows the viewport shows is held at the
  viewport's edge, over other rows, not clipped. Everything is clipped to the
  rows on screen by hand (`onScreenPart`).
- A Box drawn over the reply with a background hides the reply's text there;
  one drawn under it shows only in cells the reply leaves empty. So the grey
  card redraws the block's rows itself, from the layout.
- Box `hover`: a keyed Box is a hover scope; `hover.scope` joins a named group
  across sites; `display: 'none'` with `hover: { display: 'flex' }` reveals. A
  Box drawn `display: 'flex'` with a hover reveal is refused (the whole render
  is skipped). A hover `backgroundColor` must be a theme key, a name or hex
  (`ansi:…` is refused).
- A `Client`'s props may not hold `undefined`.
- Theme colours seen on the dark theme: `subtle` 80,80,80; dim text 153,153,153;
  `suggestion` 177,185,249; `success` 78,186,101.

## The pointer and the selection

- Claude Code asks the terminal for every pointer move (mode 1003) and SGR
  reports; hover works wherever its own does. A terminal that reports clicks
  only gets no hover: `blockHover: off`.
- A drag selection copies what is on screen, the plugin's text included
  (buttons, a card's redrawn rows). It does not go through `ui.copy`, so it
  cannot be filtered. The reply's two-column indent is left out of it.
- Hover state freezes during a drag: what showed when the drag began stays.
- A click on a `Client` is the module's own: no selection starts there.
- A click does not take the hover down.

## Side effects met while testing

- Changing a `userConfig` default in `plugin.json` and reloading a plugin loaded
  with `--plugin-dir` wrote the option into `~/.claude/settings.json` under
  `pluginConfigs["copy-buttons@inline"]`. Pass options with `--settings` instead.
