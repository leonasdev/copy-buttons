# Changelog

All notable changes to copy-buttons. Versions follow [Semantic Versioning](https://semver.org):
a removed or renamed setting option, or a changed default, is a major version.

## Unreleased

- A reply holding a table too wide for the window keeps each code block's
  and table's own buttons: the layout follows how Claude Code narrows such a
  table, wraps its cells or draws it as lines.
- So does one holding a table in a list item or a quote, which Claude Code
  draws as Markdown; `Reply` copied as rendered draws it so too.
- Replies in Hebrew, Hindi and other scripts with marks, a wrapped quote, a
  row starting with several spaces and a list in a very narrow window are
  laid out as Claude Code draws them, so their blocks keep their buttons.
- An empty code block no longer leaves a button on the closing line that
  copied nothing, nor takes a number from the blocks named like it.

## 1.1.0 — 2026-10-29

- Each code block's own button, and each table's three (`markdown`, `sheet`,
  `boxed`) one under another, at its top right while the pointer is over it,
  the part marked on a grey card or with a bar at its left. One they cannot
  be placed for keeps its button on the closing line.
- Code blocks indented with tabs, or holding tabs anywhere, get their own
  button too.
- Tables also copy as markdown. On the closing line a table's button copies
  its markdown first; a second click while it shows ✓ takes spreadsheet rows,
  then boxed.
- New setting `blockHover` (`highlight`, `bar`, `off`). `off` is for a
  terminal that reports no pointer motion: each block keeps its button on the
  closing line.
- Hovered actions light up in bold instead of inverting.

## 1.0.0 — 2026-10-27

First release.

- Copy buttons on the closing line of each turn's final answer: the whole
  reply, each code block, each table.
- `Reply` copies Markdown or the reply as rendered; a second click while it
  shows ✓ copies the other.
- Tables copy as tab-separated rows for spreadsheets, or as rendered.
- Settings: `icon` (`standard`, `nerd-font`), `replyFormat` (`markdown`,
  `rendered`), `copiedNotice` (`above-button`, `toast`, `above-prompt`).
