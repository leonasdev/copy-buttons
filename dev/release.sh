#!/bin/sh
# Release a version: move CHANGELOG.md's [Unreleased] entries under it, set it
# in plugin.json and as the tag marketplace.json installs from, run
# dev/release-check.sh, then commit, tag, push the commit and the tag together
# and make the GitHub release. Nothing is committed if a check fails.
#
#   dev/release.sh 1.4.0
set -eu
cd "$(dirname "$0")/.."

die() { printf '%s\n' "$*" >&2; exit 1; }
# Rewrite a file through a filter: edit <file> <command...>
edit() { f=$1; shift; "$@" < "$f" > "$f.tmp" && mv "$f.tmp" "$f"; }

[ $# -eq 1 ] || die 'usage: dev/release.sh <version>, e.g. 1.4.0'
version=$1
tag=v$version
echo "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || die "$version is not x.y.z"

[ "$(git branch --show-current)" = main ] || die 'release from main'
[ -z "$(git status --porcelain)" ] || die 'commit or stash your changes first'
git fetch -q origin main --tags
[ "$(git rev-list --count HEAD..origin/main)" = 0 ] || die 'main is behind origin/main: pull first'
if git rev-parse -q --verify "refs/tags/$tag" > /dev/null; then die "$tag already exists"; fi

previous=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' .claude-plugin/plugin.json | head -n 1)
if [ "$version" = "$previous" ] ||
  [ "$(printf '%s\n%s\n' "$previous" "$version" | sort -V | tail -n 1)" != "$version" ]; then
  die "$version does not come after $previous"
fi

notes=$(awk '/^## \[Unreleased\]/ { on = 1; next } /^## \[/ { on = 0 } on' CHANGELOG.md)
if [ -z "$(printf '%s' "$notes" | tr -d '[:space:]')" ]; then
  printf 'CHANGELOG.md has nothing under [Unreleased]. Commits since v%s:\n\n' "$previous" >&2
  git log --format='  %s' "v$previous..HEAD" >&2
  exit 1
fi

edit CHANGELOG.md awk -v v="$version" -v p="$previous" -v d="$(date +%F)" '
  /^## \[Unreleased\]$/ { print; print ""; print "## [" v "] - " d; next }
  /^\[Unreleased\]: / {
    url = $2; sub(/\/compare\/.*/, "", url)
    print "[Unreleased]: " url "/compare/v" v "...HEAD"
    print "[" v "]: " url "/compare/v" p "...v" v
    next
  }
  { print }'
edit .claude-plugin/plugin.json sed "s/\"version\": *\"$previous\"/\"version\": \"$version\"/"
edit .claude-plugin/marketplace.json sed "s/\"ref\": *\"v[^\"]*\"/\"ref\": \"$tag\"/"

if ! dev/release-check.sh; then
  git checkout -- CHANGELOG.md .claude-plugin
  die "Not released: the files are back as they were."
fi

# The entries as GitHub shows them: no leading blank lines, each item on one line.
body=$(printf '%s\n' "$notes" | awk '
  !started && /^$/ { next }
  /^  +[^ ]/ && item ~ /^- / { sub(/^ +/, ""); item = item " " $0; next }
  { if (started) print item; item = $0; started = 1 }
  END { if (started) print item }')

git add CHANGELOG.md .claude-plugin/plugin.json .claude-plugin/marketplace.json
printf 'chore(release): %s\n\n%s\n' "$version" "$body" | git commit -q -F -
git tag -a "$tag" -m "copy-buttons $version"
git push --atomic origin main "$tag" ||
  die "Push failed. The commit and $tag are made here: run git push --atomic origin main $tag, then dev/release.sh's gh release step."
gh release create "$tag" --verify-tag --title "$version" --notes "$body" ||
  die "The release is pushed, but its GitHub page is not made: run gh release create $tag --verify-tag --title $version --notes-file <its CHANGELOG entries>."

printf '\nReleased %s.\n' "$version"
