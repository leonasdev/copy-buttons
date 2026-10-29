# Changelog

All notable changes to copy-buttons. Versions follow [Semantic Versioning](https://semver.org):
a removed or renamed setting option, or a changed default, is a major version.

## 1.0.0 — unreleased

First release.

- Copy buttons on the closing line of each turn's final answer: the whole
  reply, each code block, each table.
- Each code block's own button, at its top right while the pointer is over
  it, the block marked on a grey card or with a bar at its left. A block it
  cannot be placed for keeps its button on the closing line.
- `Reply` copies Markdown or the reply as rendered; a second click while it
  shows ✓ copies the other.
- Tables copy as tab-separated rows for spreadsheets, or as rendered.
- Settings: `icon` (`standard`, `nerd-font`), `replyFormat` (`markdown`,
  `rendered`), `blockHover` (`highlight`, `bar`), `copiedNotice`
  (`above-button`, `toast`, `above-prompt`).
