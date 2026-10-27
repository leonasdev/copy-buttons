# copy-buttons

One-click copy buttons for Claude Code, at the end of every answer.

```
✻ Cooked for 3s · done 1:42 PM        ⧉ Reply  ⧉ table  ⧉ app.ts  ⧉ bash
```

<!-- TODO: demo GIF (docs/demo.gif) -->

- `Reply` copies the Markdown Claude wrote. Click again for the text as shown on screen.
- `table` copies rows you can paste into Excel or Google Sheets. Click again for the table with its borders.
- Each code block's button copies just its code.

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
| Copied notice | `above-button`, `toast`, `above-prompt` | Where "copied" is shown after a copy: a line above the button, a toast at the top right, or a line above the prompt. |

## 🔍 How it works

To tell a turn's final answer from the notes Claude writes between tool calls, the plugin reads the session's transcript, which Claude Code keeps in `~/.claude/projects/`. It reads it with read-only commands: `sh` with `ls`, `grep`, `xargs`, `wc`, `awk`, `head` and `tail` on Linux, macOS and WSL, or `powershell.exe` on Windows.

It writes no files, keeps nothing between sessions and makes no network requests. Copying goes through Claude Code's own clipboard support.

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

- The plugin relies on things Claude Code does not promise to keep stable: the transcript format, where the closing `✻` line is drawn, how replies are rendered, and the plugin API, which is in early access. Tested with Claude Code 2.1.306; a later update can break it. Please [open an issue](https://github.com/leonasdev/copy-buttons/issues) if it does.
- Not supported in the Claude desktop app yet, and not yet tested on macOS or native Windows.

## Credits

Markdown is parsed with [marked](https://github.com/markedjs/marked) v15.0.12 (MIT), bundled in `hooks/vendor/` with its license.

## License

[MIT](LICENSE)
