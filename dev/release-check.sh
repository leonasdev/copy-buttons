#!/bin/sh
# Everything to run before a release: the manifest and the directory's rules,
# the tests, the types, and a CHANGELOG entry for the version being released.
# What it cannot check (the buttons on a real screen) is in README's
# Development section.
#
#   dev/release-check.sh
set -eu
cd "$(dirname "$0")/.."

step() { printf '\n== %s\n' "$1"; }

step 'validate'
claude plugin validate .
step 'validate --profile directory'
claude plugin validate . --profile directory
step 'test'
claude plugin test .
step 'tsc'
npx -y -p typescript@5.6.3 tsc -p .

step 'changelog'
version=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' .claude-plugin/plugin.json | head -n 1)
if grep -q "^## $version " CHANGELOG.md; then
  echo "CHANGELOG.md has $version"
else
  echo "CHANGELOG.md has no entry for $version" >&2
  exit 1
fi
if grep -q "^## $version .*unreleased" CHANGELOG.md; then
  echo "CHANGELOG.md still marks $version unreleased: date it before the release commit" >&2
  exit 1
fi

printf '\nAll checks passed for %s.\n' "$version"
