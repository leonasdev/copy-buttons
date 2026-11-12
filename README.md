# copy-buttons

One-click copy buttons for Claude Code: on each code block and table while the pointer is over it, and at the end of every answer.

```
  npm install --save copy-buttons      ⧉ copy

✻ Cooked for 3s · done 1:42 PM                            ⧉ Reply
```

<!-- TODO: demo GIF (docs/demo.gif) -->

- `Reply` copies the Markdown Claude wrote. Click again for the text as shown on screen.
- A code block's `copy`, at its top right while the pointer is over it, copies just its code.
- A table's three buttons copy it: `markdown` as Claude wrote it, `sheet` as rows you can paste into Excel or Google Sheets, `boxed` with its borders as drawn.
- After a click on a block's button, the block flashes in the selection colour.
- A code block or table that cannot have its own buttons (see Known limitations below) gets one at the end of the answer instead, named by its file or language, or `table`. A table's copies its markdown first; click again for spreadsheet rows, and again for it boxed.

## 📦 Install

```
/plugin install copy-buttons --marketplace leonasdev/copy-buttons
```

Answer `y` to add the marketplace, then pick a scope (user scope makes it work in every session).

## ⚙️ Settings

Set them when installing, or later in `/config`.

| Setting | Options (default first) | What it does |
| --- | --- | --- |
| Icon style | `standard`, `nerd-font` | The icon before each button: `⧉`, or the Nerd Font copy icon, which needs a Nerd Font. |
| Default Reply copy format | `markdown`, `rendered` | What the first click on `Reply` copies. The second click copies the other. |
| Code & table buttons | `hover`, `always`, `end-of-answer` | When a code block's or table's buttons show: while the pointer is over it, or all the time (except one that would cover text in a narrow window). `end-of-answer` shows none on them; each one's button stays at the end of the answer. |

## 🔍 How it works

To tell a turn's final answer from the notes Claude writes between tool calls, the plugin reads the session's transcript, which Claude Code keeps in `~/.claude/projects/`. It reads it through Claude Code's own file reads, starting no process. A transcript over 4 MiB, more than one such read takes, and a forked session that has not written its own yet, are read with read-only commands: `sh` with `ls`, `grep`, `xargs`, `wc`, `awk`, `head` and `tail` on Linux, macOS and WSL, or `powershell.exe` on Windows.

To put buttons on a code block or table, it lays the answer out as the terminal does at the window's width, and trusts that only while the answer's height matches the one Claude Code reports; otherwise they keep their buttons at the end of the answer. After a copy, the flash redraws their rows over Claude Code's own.

It writes no files, keeps nothing between sessions and makes no network requests. Copying goes through Claude Code's own clipboard support.

The Claude desktop app has its own copy buttons for replies and code blocks, and its tables copy straight into spreadsheets, so there the plugin stays out of the way: it draws nothing and runs nothing.

## 🛠️ Troubleshooting

<details>
<summary>No buttons appear</summary>

The buttons need Claude Code's fullscreen mode: add `"tui": "fullscreen"` to `~/.claude/settings.json` and restart (without it, a tip says so once per session). In a long session they can take about a second to appear after Claude Code starts.

</details>

<details>
<summary>Some answers have no buttons</summary>

Only a turn's final answer gets buttons, not the text Claude writes between tool calls.

</details>

<details>
<summary>Nothing shows when the pointer is over a code block or table</summary>

Your terminal reports clicks but not pointer motion, so Claude Code never sees the pointer over it. Set Code & table buttons to `end-of-answer` in `/config`: each one's button then stays at the end of the answer, where a click is enough.

</details>

<details>
<summary>A code block or table has no button of its own</summary>

Its button is at the end of the answer instead when the plugin cannot follow how Claude Code draws the answer (a `mermaid` diagram, say, or a Claude Code update changing how it draws), or for a moment after the answer is first drawn. An empty code block has no button at all.

</details>

<details>
<summary>Selecting a code block with the mouse copies the button too</summary>

While a block's button is on screen (with the pointer over it, or all the time with `always`), a selection that takes in the button's row takes in its text. Start the selection from outside the block, or use the button. The same goes for a table.

</details>

<details>
<summary>It says copied, but nothing pastes</summary>

Over SSH, copying reaches your computer's clipboard through OSC 52, and some terminals drop it without telling Claude Code. Allow OSC 52 (clipboard access) in your terminal's settings; in tmux, `set -g set-clipboard on`. Some terminals also limit how much text OSC 52 may carry.

</details>

<details>
<summary>The icon shows as a box or a question mark</summary>

The `nerd-font` icon needs a [Nerd Font](https://www.nerdfonts.com) in your terminal. Install one, or set Icon style back to `standard` in `/config`.

</details>

<details>
<summary>Excel changes my numbers</summary>

Excel guesses each cell's format when pasting: `007` becomes `7`, `1/2` becomes a date. Format the target cells as text first.

</details>

## ⚠️ Known limitations

- The plugin relies on things Claude Code does not promise to keep stable: the transcript format, where the closing `✻` line is drawn, how replies are rendered and wrapped, and the plugin API, which is in early access. Tested with Claude Code 2.1.318 to 2.1.322; a later update can break it. Please [open an issue](https://github.com/leonasdev/copy-buttons/issues) if it does.
- Code blocks and tables get no buttons of their own in an answer holding a `mermaid` code block: Claude Code draws it as a diagram, which the plugin does not follow. Their buttons are at the end of the answer instead.
- In tmux, an answer holding Devanagari (Hindi) is drawn a row lower below each line tmux finds too long, so a block's buttons and flash there look a row off.
- In a narrow window a block's or table's button can cover the end of its first row while the pointer is over it.
- Not yet tested on macOS or native Windows.

## Development

The checks, CI and releasing: [docs/development.md](docs/development.md).

## Credits

Markdown is parsed with [marked](https://github.com/markedjs/marked) v15.0.12 (MIT), bundled in `hooks/vendor/` with its license.

## License

[MIT](LICENSE)
