# copy-buttons

One-click copy buttons for Claude Code: on each code block while the pointer is over it, and at the end of every answer.

```
  npm install --save copy-buttons      ⧉ copy

✻ Cooked for 3s · done 1:42 PM                    ⧉ Reply  ⧉ table
```

<!-- TODO: demo GIF (docs/demo.gif) -->

- `Reply` copies the Markdown Claude wrote. Click again for the text as shown on screen.
- `table` copies rows you can paste into Excel or Google Sheets. Click again for the table with its borders.
- A code block's `copy`, at its top right while the pointer is over it, copies just its code. A block that cannot have one (see Known limitations below) gets its button at the end of the answer instead, named by its file or language.

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
| Copy reply as | `markdown`, `rendered` | What the first click on `Reply` copies. The second click copies the other. |
| Code block hover | `highlight`, `bar`, `off` | How a code block is marked while the pointer is over it: on a grey card, or with a bar at its left. `off` shows no button on the block; each block's button stays at the end of the answer. |
| Copied notice | `above-button`, `toast`, `above-prompt` | Where "copied" is shown after a copy: a line above the button, a toast at the top right, or a line above the prompt. |

## 🔍 How it works

To tell a turn's final answer from the notes Claude writes between tool calls, the plugin reads the session's transcript, which Claude Code keeps in `~/.claude/projects/`. It reads it with read-only commands: `sh` with `ls`, `grep`, `xargs`, `wc`, `awk`, `head` and `tail` on Linux, macOS and WSL, or `powershell.exe` on Windows.

To put a button on a code block, it lays the answer out as the terminal does at the window's width, and trusts that only while the answer's height matches the one Claude Code reports; otherwise the blocks keep their buttons at the end of the answer. In `highlight` mode the card redraws the block's rows over Claude Code's own.

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
<summary>Nothing shows when the pointer is over a code block</summary>

Your terminal reports clicks but not pointer motion, so Claude Code never sees the pointer over the block. Set Code block hover to `off` in `/config`: each block's button then stays at the end of the answer, where a click is enough.

</details>

<details>
<summary>A code block has no button of its own</summary>

Its button is at the end of the answer instead when the answer holds a table wider than the window (Claude Code narrows it in a way the plugin does not follow), when the block holds a tab anywhere but in a line's indent, or for a moment after the answer is first drawn. An empty block has no button at all.

</details>

<details>
<summary>Selecting a code block with the mouse copies the button too</summary>

While the pointer is over a block its button is on screen, and a selection that takes in the button's row takes in its text. Start the selection from outside the block, or use the button.

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

- The plugin relies on things Claude Code does not promise to keep stable: the transcript format, where the closing `✻` line is drawn, how replies are rendered and wrapped, and the plugin API, which is in early access. Tested with Claude Code 2.1.312; a later update can break it. Please [open an issue](https://github.com/leonasdev/copy-buttons/issues) if it does.
- A code block's own button is not drawn in an answer holding a table wider than the window, nor on a block holding a tab past a line's indent.
- In a narrow window a block's button can cover the end of its first row while the pointer is over the block.
- Not yet tested on macOS or native Windows.

## Credits

Markdown is parsed with [marked](https://github.com/markedjs/marked) v15.0.12 (MIT), bundled in `hooks/vendor/` with its license.

## License

[MIT](LICENSE)
