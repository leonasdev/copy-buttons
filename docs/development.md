# Development

## Checks

| Command | What it checks | Needs |
| --- | --- | --- |
| `claude plugin test .` | The hooks, with Claude Code's own engine standing in for the screen and the transcript | |
| `bun test ./dev/check-readers.ts` | The scripts that read the transcript (`sh` and `awk`, PowerShell where found), which the tests stand in for, on transcripts written to a temporary folder | |
| `bun dev/check-buttons.ts` | The buttons on a real screen: hovers and clicks them, and reads back what they copy | tmux |
| `bun dev/check-rendering.ts` | The `rendered` copy against what Claude Code draws | tmux |
| `bun dev/capture-fixtures.ts` | Takes the screens the layout tests expect again; a fixture drawn otherwise is rewritten, and `git diff tests/fixtures/` shows how | tmux |
| `bun dev/check-live.ts` | Haiku answers a turn with the plugin loaded: Reply on its closing line, then the transcript Claude Code wrote | `CLAUDE_CODE_OAUTH_TOKEN`, from `claude setup-token` |

The tmux ones resume sessions of their own, signed out: nothing is sent to the model. `dev/release-check.sh` runs every check a release needs but the last two, and changes nothing. [manual-testing.md](manual-testing.md) covers what none of them can: other terminals, a narrow window, scrolling.

`bun dev/check-transcripts.ts` is no test: it reads the newest transcripts on your machine as the plugin does, and compares that with each row's fields, to find what Claude Code writes that the plugin does not expect. What it finds depends on what you have done lately; a case it turns up belongs in `dev/check-readers.ts`.

## CI

`.github/workflows/`:

- `ci.yml` runs the checks on each pull request and push to `main`, with the Claude Code in `.github/claude-code-version`, so a new Claude Code turns no pull request red; on macOS and Windows too for a release's tag.
- `claude-code-watch.yml` looks for a new Claude Code every six hours and checks it once, on all three and live (with the `CLAUDE_CODE_OAUTH_TOKEN` secret). One that fails opens an issue; one that passes closes those of the versions before it, and updates `.github/claude-code-version` and README's "Tested with" in a pull request.

## Releasing

Pushing to `main` reaches no one: the marketplace installs the tag named in `.claude-plugin/marketplace.json`, and only a release moves it.

1. Note each change users will see under `## [Unreleased]` in `CHANGELOG.md`.
2. Run `dev/release.sh <version>`, the version picked by [Semantic Versioning](https://semver.org) and the rule at the top of the changelog. It dates the entries, sets the version in `plugin.json` and the tag in `marketplace.json`, runs `dev/release-check.sh`, then commits, tags, pushes both together and makes the GitHub release. If a check fails it puts the files back and commits nothing; if `[Unreleased]` is empty it lists the commits since the last release.
