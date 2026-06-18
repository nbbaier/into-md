# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-06-18

### Fixed

- Restricted the published npm package to `dist/` and `CHANGELOG.md` via a
  `files` allowlist. Earlier releases inadvertently published the full repo —
  source, tests, docs, lockfile, and local editor/agent config — bloating every
  install. The runtime only needs the built `dist/` output.

### Added

- Declared the MIT license in `package.json` and added a `LICENSE` file (the
  README already stated MIT; it is now consistent across the package).
- Added `description` and `keywords` to `package.json` for npm discoverability.
- Added npm version, CI status, and license badges to the README.

## [1.0.0] - 2026-06-18

First stable release. The v1 CLI surface is now frozen — the documented flags
(`-o/--output`, `--js`, `--no-js`, `--raw`, `--cookies`, `--user-agent`,
`--encoding`, `--strip-links`, `--exclude`, `--timeout`, `--no-cache`,
`-v/--verbose`) are committed and will follow semver from here on.

### Added

- Unit test coverage for the core transformation modules — `utils`, `converter`,
  `extractor`, `tables`, and `metadata`. The suite grew from 39 to 74 tests.
- CI workflow (`.github/workflows/ci.yml`) running lint, typecheck, and tests on
  every push to `main` and on pull requests.

### Fixed

- Tables without an explicit `<thead>` no longer duplicate their header row as a
  data row. The HTML parser wraps loose `<tr>` rows in an implicit `<tbody>`, so
  the previous `slice(1)` that should have dropped the header row never ran; the
  skip-first-row decision is now keyed on whether headers came from a real
  `<thead>`. A regression test exercises all four table shapes.

### Changed

- Froze the v1 CLI surface: no flags were added or removed for this release.
- Sharpened the README intro to state the LLM-context differentiator.
- Synced `bun.lock` dependency ranges to `package.json` so CI installs with
  `--frozen-lockfile`.

[1.0.0]: https://github.com/nbbaier/into-md/releases/tag/v1.0.0
