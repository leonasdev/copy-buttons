# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html):
a removed or renamed setting option, or a changed default, is a major version.

## [Unreleased]

## [1.2.0] - 2026-10-30

### Changed

- The buttons at the end of an answer turn purple on hover, like a code
  block's.

### Fixed

- Code blocks and tables kept no hover buttons of their own in answers:
  - with a table too wide for the window
  - with a table inside a list or a quote
  - with lists nested four or more levels deep
  - in very narrow windows
  - in Hebrew, Hindi and other scripts with accent marks
- An empty code block got a button that copied nothing.

## [1.1.0] - 2026-10-29

### Added

- Hover buttons: point at a code block to copy it, or at a table to copy it
  as Markdown (`markdown`), as spreadsheet rows (`sheet`) or with its
  borders (`boxed`).
- Setting `blockHover`: mark the hovered block with a grey card
  (`highlight`) or a bar at its left (`bar`), or turn hover buttons off
  (`off`) for terminals that don't report mouse movement.
- Tables can be copied as Markdown. At the end of an answer, click a table's
  button again to switch to spreadsheet rows, then to boxed.

### Changed

- Buttons turn bold on hover instead of inverting.

## [1.0.0] - 2026-10-27

### Added

- Copy buttons at the end of each answer: the whole reply, each code block,
  each table.
- `Reply` copies the Markdown; click again for the text as shown on screen.
- Tables copy as spreadsheet rows, or as drawn.
- Settings: `icon`, `replyFormat`, `copiedNotice`.

[Unreleased]: https://github.com/leonasdev/copy-buttons/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/leonasdev/copy-buttons/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/leonasdev/copy-buttons/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/leonasdev/copy-buttons/releases/tag/v1.0.0
