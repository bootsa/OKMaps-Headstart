# Changelog

## [7.1.7](https://github.com/bootsa/OKMaps-Headstart/compare/v7.1.6...v7.1.7) (2026-11-07)


### Features

* **pages:** describe each version on the versions page ([d262af9](https://github.com/bootsa/OKMaps-Headstart/commit/d262af92c7f51a8ed8e6fa5acc53e11ac653d445))


### Bug Fixes

* **ui-svelte:** centre zoomed papers and their titles inside the area ([7daa5ff](https://github.com/bootsa/OKMaps-Headstart/commit/7daa5ff1af5e0de6b14961d45994389cf131976d))

## [7.1.6](https://github.com/bootsa/OKMaps-Headstart/compare/v7.1.5...v7.1.6) (2026-11-06)


### Features

* **ui-svelte:** name the zoomed area in the list header and add a height toggle ([380aeed](https://github.com/bootsa/OKMaps-Headstart/commit/380aeedbc3ecdc3f37567a21645e11722cc713ba))
* **ui-svelte:** name the zoomed area in the list header and add a height toggle ([0b5cc33](https://github.com/bootsa/OKMaps-Headstart/commit/0b5cc3337dcba124767e122a54721177eef1b737))

## [7.1.5](https://github.com/bootsa/OKMaps-Headstart/compare/v7.1.4...v7.1.5) (2026-11-06)


### Features

* **ui-svelte:** readable papers on the knowledge map ([08ced64](https://github.com/bootsa/OKMaps-Headstart/commit/08ced6480904753d9af0cad014b0c86d69b152fb))
* **ui-svelte:** readable papers on the knowledge map ([c6d41ba](https://github.com/bootsa/OKMaps-Headstart/commit/c6d41bad74471d5d93f1fdd2abd4edcb36a0c033))

## [7.1.4](https://github.com/bootsa/OKMaps-Headstart/compare/v7.1.3...v7.1.4) (2026-11-06)


### Features

* **ui-svelte:** add the paper list with search, filter and sort ([fb3a28b](https://github.com/bootsa/OKMaps-Headstart/commit/fb3a28b3f288679bf50ba8d1820589a3a6448c35))
* **ui-svelte:** add the paper list with search, filter and sort ([ac5fa16](https://github.com/bootsa/OKMaps-Headstart/commit/ac5fa16ce5bec1cdb3b9820b62e63c7ef73d9a8b))

## [7.1.3](https://github.com/bootsa/OKMaps-Headstart/compare/v7.1.2...v7.1.3) (2026-11-06)


### Features

* **ui-svelte:** draw the knowledge map in Svelte, with an old/new toggle ([4bf0ef3](https://github.com/bootsa/OKMaps-Headstart/commit/4bf0ef390604ea0cfb78f1192bf0d34e5e89186d))
* **ui-svelte:** draw the knowledge map in Svelte, with an old/new toggle ([d8dc9b5](https://github.com/bootsa/OKMaps-Headstart/commit/d8dc9b523e616931cbe500a22bf841af1af55fce))

## [7.1.2](https://github.com/bootsa/OKMaps-Headstart/compare/v7.1.0...v7.1.2) (2026-11-06)


### Features

* geo map places and streamgraph streams in the Svelte data layer ([8036aef](https://github.com/bootsa/OKMaps-Headstart/commit/8036aefd1caaa4a08d5f3ee45260c44f5039859b))
* process maps and hold the interface state in the Svelte package ([8245f8f](https://github.com/bootsa/OKMaps-Headstart/commit/8245f8f082609ef64f774521a3f43617b550872a))
* process maps and hold the interface state in the Svelte package ([94829d3](https://github.com/bootsa/OKMaps-Headstart/commit/94829d344e34725de5e5de24b1b9bf8203a7ae13))


### Miscellaneous Chores

* replace ESLint and Prettier with Biome ([92803e1](https://github.com/bootsa/OKMaps-Headstart/commit/92803e1a0ab264697734d24ac449079fafe6f901))

## [7.1.0](https://github.com/bootsa/OKMaps-Headstart/compare/v7.0.0...v7.1.0) (2026-11-06)


### Features

* add the Svelte 5 interface package with design tokens and Storybook ([d01fdc7](https://github.com/bootsa/OKMaps-Headstart/commit/d01fdc74e11f4d0b3c10c0f96192230937a8b135))
* add the Svelte 5 interface package with design tokens and Storybook ([929015c](https://github.com/bootsa/OKMaps-Headstart/commit/929015c0904c1230d57e43163368772314f936ea))


### Bug Fixes

* register jest-dom matchers on the ui-svelte package's own vitest ([7fab2fe](https://github.com/bootsa/OKMaps-Headstart/commit/7fab2fe6ab3cdf7900b13dd21be1b2029bab3655))

## [7.0.0](https://github.com/bootsa/OKMaps-Headstart/compare/v6.0.0...v7.0.0) (2026-11-06)


### ⚠ BREAKING CHANGES

* the old server, its API and its map ids are no longer part of this repository.

### Features

* the browser app replaces the server ([e2958ce](https://github.com/bootsa/OKMaps-Headstart/commit/e2958ce1c546a754868d6db2c1356178c6b63d3a))

## 2022-07-20

### Changes

- Improved streamgraph so that it works with the BASE data too.
- Improved streamgraph UI (labels, tooltip, axes).
- Improved the citation feature: added more metadata (issue, page, volume, issn).
- Improved the UI in general: customized behavior for non-textual documents.

## 2022-07-14

### Bugfixes

- Fixed a few loopholes in the error handling logic of the backend (PR #672).

## 2022-06-23

### Bugfixes

- Removed the embed=true parameter from the vis citation.
- Making sure the embed=true parameter is only once in the embed modal.

## 2022-05-19

### New features

- The BASE content provider is now displayed in the context line & more info modal.

### Changes

- The new share buttons are now hidden in the embed mode.

## 2022-05-05

### New features

- Added export to BibTex for each paper (frontend interface & backend endpoint).
- Added BASE document type tags with icons.
- New share buttons.

### Changes

- New look and feel (design & CSS changes).

### Security

- Periodical npm security update.

## 2022-03-28

### Changes

- Streamgraph CSS changes: rounded buttons, heading color.
- Default timespan date in GoTriple.

## 2022-03-17

### Deprecations

- Unsupported browser warning is now displayed also in Opera and Edge (the only supported browsers are Chrome, Firefox and Safari).

### Internal

- Refactored remaining old code.

## 2022-03-03

### Security

- Routine npm security update

## 2022-02-17

### Changes

- disabled the cite paper feature in main integration
- enabled the cite paper feature in Triple

## 2022-01-31

### New features

- new citation button & modal generating citations (APA, MLA, Chicago, ACM) for each paper

### Changes

- unified appearance and functionality of copy buttons in modals
- FontAwesome update: new icons; reduced dependency on outer page imports

### Bug fixes

- fixed crashing app when a pdf preview was opened during animation

### Internal

- removed unused local examples; added new local examples (triple, viper, covis)

## 2022-01-20

### New features

- backend data sanitization
- pdfs searchable by the searchbox

### Changes

- data preprocessing refactoring

### Bug fixes

- footer size on narrow screens

### Internal

- test database update

## 2021-12-22

### Changes

- unified HTML & CSS of various paper tags (access tags, dataset tag, custom tags)

## 2021-12-09

### New features

- added abbreviation to list entry items (heading, source, authors)

### Changes

- refactored list entries code
- heading & list UI changes
    - moved info button to the context line
    - moved pdf button
    - minor list changes
- major CSS changes (restyled the whole Headstart)

### Removed

- link buttons from list

## 2021-11-25

### New features

- zooming and selecting papers with browser's back/forward buttons
- adding a zoomed bubble/selected paper name to the page title

### Changes

- improved hot reloading in webpack
- urls of local examples have changed

### Removed

- dead tracking code (Google Analytics, our custom endpoint) and related config parameter
