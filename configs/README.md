# Project configs

Build configs of custom OKMaps versions, one JSON file per project. See
[packages/config](../packages/config/README.md) for the format, and
[its examples](../packages/config/examples/).

    pnpm okmaps configure configs/<project>.json   # make or change one
    pnpm okmaps check configs/<project>.json
    pnpm okmaps build configs/<project>.json --out dist-<project>

Keep secrets out of these files: write `"${env:NAME}"` and set `NAME` when
building (the "Custom build" workflow reads repository variables).
