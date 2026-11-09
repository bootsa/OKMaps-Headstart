# @okmaps/configurator

The web configurator for custom OKMaps versions: a form over the build
config of [@okmaps/config](../../packages/config/README.md), with a light and
dark preview of the look, the problems a build would report, the file to
download and the commands that build it. Plain TypeScript, no framework;
the form remembers itself in this browser.

    pnpm --filter @okmaps/configurator dev
    pnpm --filter @okmaps/configurator build    # dist/, relative paths
    pnpm --filter @okmaps/configurator test

GitHub Pages publishes it at `/configure/` (see `.github/scripts/build-pages.sh`).
