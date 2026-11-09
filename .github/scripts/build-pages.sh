#!/usr/bin/env bash
# Builds every published version of the app into one GitHub Pages site:
#
#   <site>/latest/     the default branch
#   <site>/v1.2.0/     each tag v* (a release) that has the browser app
#   <site>/storybook/  the design system (Storybook) of the default branch
#   <site>/elements/   the web components bundle and its plain-HTML example
#   <site>/configure/  the configurator for custom versions (apps/configurator)
#   <site>/index.html  sends visitors to latest/
#   <site>/versions.html, versions.json   the list of versions
#
# Each version is its own app: own base path, own service worker and cache.
# Maps and the storage choice live in the browser per site (origin), so all
# versions see the same maps.
#
# A release never changes, so its build is kept in PAGES_CACHE (a folder the
# workflow keeps between runs with actions/cache) and reused while the
# settings it was built with (stamp) are the same. Only latest and new or
# changed releases are built.
#
# Usage: build-pages.sh <repository name> <output folder>
# Env: VITE_GATEWAY_URL, VITE_CROSSREF_MAILTO (passed to every build),
#      PAGES_MAX_VERSIONS (newest tags to publish, default 20),
#      PAGES_CACHE (folder of earlier release builds; optional).
set -euo pipefail

repo_name=$1
site=$(realpath -m "$2")
root=$(git rev-parse --show-toplevel)
work=$(mktemp -d)
mkdir -p "$site"

# Where the browser app is in a checkout: apps/frontend, or packages/app before the monorepo.
app_dir() { # <checkout>
  if [ -d "$1/apps/frontend" ]; then echo apps/frontend; else echo packages/app; fi
}

build() { # <git ref> <folder> <version label>
  local ref=$1 dir=$2 label=$3 tree="$work/$2"
  echo "::group::Build $label ($ref) into /$dir/"
  git -C "$root" worktree add --detach "$tree" "$ref" >/dev/null
  local app
  app=$(app_dir "$tree")
  (
    cd "$tree"
    export APP_BASE="/$repo_name/$dir/" VITE_APP_VERSION="$label"
    if [ -f pnpm-lock.yaml ]; then
      # The pnpm workspace (apps/frontend and packages/*).
      pnpm install --frozen-lockfile
      pnpm build
    else
      # Releases up to v7.0.0: npm, with vis/ in the root and the app in packages/app.
      if [ -f config.example.js ]; then cp config.example.js config.js; fi
      npm ci --no-audit --no-fund
      cd packages/app
      npm ci --no-audit --no-fund
      npm run build:vis
      npm run build
    fi
  )
  cp -r "$tree/$app/dist" "$site/$dir"
  if [ "$dir" = latest ] && [ -d "$tree/packages/ui-svelte" ]; then
    (cd "$tree" && pnpm --filter @okmaps/ui-svelte build-storybook)
    cp -r "$tree/packages/ui-svelte/storybook-static" "$site/storybook"
  fi
  if [ "$dir" = latest ] && [ -d "$tree/packages/elements" ]; then
    (cd "$tree" && pnpm --filter @okmaps/elements build)
    mkdir -p "$site/elements"
    cp -r "$tree/packages/elements/dist" "$tree/packages/elements/example" "$site/elements/"
  fi
  if [ "$dir" = latest ] && [ -d "$tree/apps/configurator" ]; then
    (cd "$tree" && pnpm --filter @okmaps/configurator build)
    cp -r "$tree/apps/configurator/dist" "$site/configure"
  fi
  git -C "$root" worktree remove --force "$tree"
  echo "::endgroup::"
}

default_branch=${DEFAULT_BRANCH:-main}
build "${LATEST_REF:-origin/$default_branch}" latest latest

# What a release build depends on besides its tag.
stamp="$repo_name|${VITE_GATEWAY_URL:-}|${VITE_CROSSREF_MAILTO:-}"
cache=${PAGES_CACHE:+$(realpath -m "$PAGES_CACHE")}

# Release tags, newest first, that contain the browser app (its package.json;
# not a file inside it that a later release may drop). The limit counts
# published versions, so tags without the app don't use it up.
versions=()
reused=0
max=${PAGES_MAX_VERSIONS:-20}
for tag in $(git -C "$root" tag --list 'v*' --sort=-version:refname); do
  [ "${#versions[@]}" -lt "$max" ] || break
  if git -C "$root" cat-file -e "$tag:apps/frontend/package.json" 2>/dev/null ||
    git -C "$root" cat-file -e "$tag:packages/app/package.json" 2>/dev/null; then
    commit=$(git -C "$root" rev-parse "$tag^{commit}")
    if [ -n "$cache" ] && [ "$(cat "$cache/$tag/.stamp" 2>/dev/null)" = "$commit|$stamp" ]; then
      echo "Reusing the build of $tag"
      cp -r "$cache/$tag/site" "$site/$tag"
      reused=$((reused + 1))
    else
      build "$tag" "$tag" "$tag"
      if [ -n "$cache" ]; then
        rm -rf "${cache:?}/$tag" && mkdir -p "$cache/$tag"
        cp -r "$site/$tag" "$cache/$tag/site"
        echo "$commit|$stamp" >"$cache/$tag/.stamp"
      fi
    fi
    versions+=("$tag")
  else
    echo "Skipping $tag: it has no browser app."
  fi
done

# What a release changed, in one line: its features and fixes from
# CHANGELOG.md (written by release-please from the commit subjects), each
# once, without scopes or commit links. Empty for releases it doesn't list.
summary() { # <tag>
  awk -v want="${1#v}" '
    /^## / { on = index($0, "[" want "]") == 4; kind = ""; next }
    /^### / { kind = ($0 ~ /Features|Bug Fixes/); next }
    on && kind && /^\* / {
      line = $0
      sub(/^\* (\*\*[^*]*:\*\* )?/, "", line)
      sub(/ \(\[[0-9a-f]+\]\([^)]*\)\)$/, "", line)
      if (!(line in seen)) { seen[line] = 1; out = out (out ? "; " : "") line }
    }
    END { print out }
  ' "$root/CHANGELOG.md" 2>/dev/null
}

# The list of versions, and the pages that point to them.
{
  printf '[{"name":"latest","path":"latest/"}'
  for v in "${versions[@]}"; do
    printf ',{"name":"%s","path":"%s/","summary":"%s"}' "$v" "$v" "$(summary "$v" | sed 's/[\\"]/\\&/g')"
  done
  printf ']\n'
} >"$site/versions.json"

items='<li><a href="latest/">latest</a> (the newest code)</li>'
storybook=""
[ -d "$site/storybook" ] && storybook='<p>The interface and its design system: <a href="storybook/">Storybook</a>.</p>'
[ -d "$site/configure" ] && storybook+='<p>Your own version, with the sources, stores, views and look you choose: <a href="configure/">configurator</a>.</p>'
for v in "${versions[@]}"; do
  about=$(summary "$v" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')
  items+="<li><a href=\"$v/\">$v</a>${about:+ – $about}</li>"
done
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
$storybook
</body>
</html>
HTML
}
page "Open Knowledge Maps" '<meta http-equiv="refresh" content="0; url=latest/" />' >"$site/index.html"
page "Open Knowledge Maps: versions" "" >"$site/versions.html"
touch "$site/.nojekyll"
# Drop cached builds of releases no longer published.
if [ -n "$cache" ] && [ -d "$cache" ]; then
  for dir in "$cache"/*/; do
    name=$(basename "$dir")
    [[ " ${versions[*]:-} " == *" $name "* ]] || rm -rf "${cache:?}/$name"
  done
fi
echo "Published latest and ${#versions[@]} release(s) (${reused} reused): ${versions[*]:-none}"
