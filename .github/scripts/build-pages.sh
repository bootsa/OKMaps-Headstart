#!/usr/bin/env bash
# Builds every published version of the app into one GitHub Pages site:
#
#   <site>/latest/     the default branch
#   <site>/v1.2.0/     each tag v* (a release) that has the browser app
#   <site>/index.html  sends visitors to latest/
#   <site>/versions.html, versions.json   the list of versions
#
# Each version is its own app: own base path, own service worker and cache.
# Maps and the storage choice live in the browser per site (origin), so all
# versions see the same maps.
#
# Usage: build-pages.sh <repository name> <output folder>
# Env: VITE_GATEWAY_URL, VITE_CROSSREF_MAILTO (passed to every build),
#      PAGES_MAX_VERSIONS (newest tags to build, default 20).
set -euo pipefail

repo_name=$1
site=$(realpath -m "$2")
root=$(git rev-parse --show-toplevel)
work=$(mktemp -d)
mkdir -p "$site"

build() { # <git ref> <folder> <version label>
  local ref=$1 dir=$2 label=$3 tree="$work/$2"
  echo "::group::Build $label ($ref) into /$dir/"
  git -C "$root" worktree add --detach "$tree" "$ref" >/dev/null
  (
    cd "$tree"
    cp config.example.js config.js
    npm ci --no-audit --no-fund
    cd packages/app
    npm ci --no-audit --no-fund
    export APP_BASE="/$repo_name/$dir/" VITE_APP_VERSION="$label"
    npm run build:vis
    npm run build
  )
  cp -r "$tree/packages/app/dist" "$site/$dir"
  git -C "$root" worktree remove --force "$tree"
  echo "::endgroup::"
}

default_branch=${DEFAULT_BRANCH:-main}
build "${LATEST_REF:-origin/$default_branch}" latest latest

# Release tags, newest first, that contain the browser app's build.
versions=()
for tag in $(git -C "$root" tag --list 'v*' --sort=-version:refname | head -n "${PAGES_MAX_VERSIONS:-20}"); do
  if git -C "$root" cat-file -e "$tag:packages/app/scripts/build-vis.mjs" 2>/dev/null; then
    build "$tag" "$tag" "$tag"
    versions+=("$tag")
  else
    echo "Skipping $tag: it has no browser app."
  fi
done

# The list of versions, and the pages that point to them.
{
  printf '[{"name":"latest","path":"latest/"}'
  for v in "${versions[@]}"; do printf ',{"name":"%s","path":"%s/"}' "$v" "$v"; done
  printf ']\n'
} >"$site/versions.json"

items='<li><a href="latest/">latest</a> (the newest code)</li>'
for v in "${versions[@]}"; do items+="<li><a href=\"$v/\">$v</a></li>"; done
page() { # <title> <extra head>
  cat <<HTML
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>$1</title>
$2
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 16px;color:#222}a{color:#2856b6}</style>
</head>
<body>
<h1>Open Knowledge Maps: versions</h1>
<ul>$items</ul>
<p>Every version keeps your maps in the same place, so you can switch between them.</p>
</body>
</html>
HTML
}
page "Open Knowledge Maps" '<meta http-equiv="refresh" content="0; url=latest/" />' >"$site/index.html"
page "Open Knowledge Maps: versions" "" >"$site/versions.html"
touch "$site/.nojekyll"
echo "Built latest and ${#versions[@]} release(s): ${versions[*]:-none}"
