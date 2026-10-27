// How the transcript is read on each platform: a command that finds the
// session's transcript, and one that prints the tokens of what was added to
// it since a byte offset. Both platforms print the same tokens:
//   T <uuid>  the model wrote text       U  the model called a tool
//   D         the turn's closing line    P  the person's next prompt
// then `O <offset>`, the byte after the last whole row read; a row still being
// written (no newline yet) is left for the next read. Subagents' rows are
// left out.

export type Reader = {
  // argv that prints the transcript's path (base64 of its UTF-8 on Windows),
  // or exits non-zero where there is none.
  locate: (session: string, uuid: string) => string[]
  scan: (file: string, offset: number) => string[]
  decodePath: (stdout: string) => string
}

// Linux, macOS and WSL: POSIX sh and its tools. The session's own file comes
// first; a forked session that has not written its own yet still draws rows
// from another, so where it has none the newest transcripts holding the reply
// are searched.
const LOCATE_SH = `
d="\${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects"
f=$(ls -t "$d"/*/"$1".jsonl 2>/dev/null | head -n 1)
[ -n "$f" ] || f=$(ls -t "$d"/*/*.jsonl 2>/dev/null | head -n 50 | xargs grep -lF "\\"uuid\\":\\"$2\\"" 2>/dev/null | head -n 1)
[ -n "$f" ] || exit 3
printf '%s' "$f"
`

// Each row is printed one row late, and the last only when the bytes read end
// with it, so a row still being written waits.
const SCAN_SH = `
size=$(wc -c < "$1")
[ "$size" -gt "$2" ] || { echo "O $2"; exit 0; }
tail -c +"$(($2 + 1))" "$1" | head -c "$(($size - $2))" | LC_ALL=C awk -v start="$2" -v total="$(($size - $2))" '
  function emit(row) {
    if (index(row, "\\"isSidechain\\":true")) return
    if (index(row, "\\"subtype\\":\\"turn_duration\\"")) { print "D"; return }
    if (index(row, "\\"role\\":\\"assistant\\"")) {
      if (index(row, "\\"content\\":[{\\"type\\":\\"tool_use\\"")) { print "U"; return }
      if (index(row, "\\"content\\":[{\\"type\\":\\"text\\"") && match(row, /"uuid":"[^"]+"/)) {
        print "T " substr(row, RSTART + 8, RLENGTH - 9)
      }
      return
    }
    if (index(row, "\\"type\\":\\"user\\"") && !index(row, "\\"type\\":\\"tool_result\\"")) print "P"
  }
  NR > 1 { emit(prev); used += length(prev) + 1 }
  { prev = $0 }
  END {
    if (NR > 0 && used + length(prev) + 1 == total) { emit(prev); used += length(prev) + 1 }
    print "O " (start + used)
  }
'
`

export const posix: Reader = {
  locate: (session, uuid) => ['sh', '-c', LOCATE_SH, 'sh', session, uuid],
  scan: (file, offset) => ['sh', '-c', SCAN_SH, 'sh', file, String(offset)],
  decodePath: stdout => stdout,
}

// Windows: Windows PowerShell 5.1, which every Windows has. Values are written
// into the script as single-quoted literals; the path comes back as base64 so
// a name outside the console's code page survives.
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`

const locatePs = (projects: string, session: string, uuid: string) => `
$ErrorActionPreference = 'SilentlyContinue'
$d = ${literal(projects)}
$key = '"uuid":"' + ${literal(uuid)} + '"'
$f = Get-ChildItem -Path (Join-Path (Join-Path $d '*') (${literal(session)} + '.jsonl')) -File |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $f) {
  $f = Get-ChildItem -Path (Join-Path (Join-Path $d '*') '*.jsonl') -File |
    Sort-Object LastWriteTime -Descending | Select-Object -First 50 |
    Where-Object { Select-String -LiteralPath $_.FullName -SimpleMatch -Pattern $key -Quiet } |
    Select-Object -First 1
}
if (-not $f) { exit 3 }
[Console]::Out.Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($f.FullName)))
`

const scanPs = (file: string, offset: number) => `
$ErrorActionPreference = 'Stop'
$off = [int64]${offset}
$s = [IO.File]::Open(${literal(file)}, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
try {
  $len = $s.Length
  if ($len -le $off) { [Console]::Out.Write("O $off"); exit 0 }
  [void]$s.Seek($off, [IO.SeekOrigin]::Begin)
  $buf = New-Object byte[] ([int]($len - $off))
  $got = 0
  while ($got -lt $buf.Length) {
    $n = $s.Read($buf, $got, $buf.Length - $got)
    if ($n -le 0) { break }
    $got += $n
  }
} finally { $s.Close() }
$end = -1
if ($got -gt 0) { $end = [Array]::LastIndexOf($buf, [byte]10, $got - 1) }
$out = New-Object Text.StringBuilder
if ($end -ge 0) {
  foreach ($row in [Text.Encoding]::UTF8.GetString($buf, 0, $end + 1).Split([char]10)) {
    if ($row.Contains('"isSidechain":true')) { continue }
    if ($row.Contains('"subtype":"turn_duration"')) { [void]$out.Append("D\`n"); continue }
    if ($row.Contains('"role":"assistant"')) {
      if ($row.Contains('"content":[{"type":"tool_use"')) { [void]$out.Append("U\`n"); continue }
      if ($row.Contains('"content":[{"type":"text"')) {
        $m = [regex]::Match($row, '"uuid":"([^"]+)"')
        if ($m.Success) { [void]$out.Append('T ' + $m.Groups[1].Value + "\`n") }
      }
      continue
    }
    if ($row.Contains('"type":"user"') -and -not $row.Contains('"type":"tool_result"')) { [void]$out.Append("P\`n") }
  }
}
[void]$out.Append('O ' + ($off + $end + 1))
[Console]::Out.Write($out.ToString())
`

const POWERSHELL = ['powershell.exe', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command']

export function windows(projects: string, shell: readonly string[] = POWERSHELL): Reader {
  return {
    locate: (session, uuid) => [...shell, locatePs(projects, session, uuid)],
    scan: (file, offset) => [...shell, scanPs(file, offset)],
    decodePath: stdout => new TextDecoder().decode(Uint8Array.from(atob(stdout.trim()), c => c.charCodeAt(0))),
  }
}
