# Releasing

Releases go out from a clean, CI-green `main`. Pick the bump by semver: fixes → `patch`, new flags or behavior → `minor`, breaking CLI changes → `major`.

1. **Changelog.** In `CHANGELOG.md`, rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`, add a fresh empty `## [Unreleased]` above it, and add a `[X.Y.Z]: https://github.com/nbbaier/into-md/releases/tag/vX.Y.Z` link at the bottom. Commit it (`docs: changelog for X.Y.Z`). `npm version` refuses a dirty tree, so this commit comes first.

2. **Version, build, push.**

   ```bash
   bun run release:patch   # or release:minor / release:major
   ```

   This bumps `package.json`, commits `vX.Y.Z`, creates an annotated `vX.Y.Z` tag, builds `dist/`, and runs `git push --follow-tags`. Confirm the tag reached GitHub with `git ls-remote --tags origin vX.Y.Z`.

3. **GitHub release**, with the changelog entry as notes. Publishing it triggers `.github/workflows/publish.yml`, which publishes to npm:

   ```bash
   v=X.Y.Z
   awk -v v="$v" '$0 ~ "^## \\[" v "\\]" {on=1; next} /^## \[/ {on=0} on' CHANGELOG.md > /tmp/notes.md
   gh release create "v$v" --title "v$v" --notes-file /tmp/notes.md
   ```

4. **Watch the publish.**

   ```bash
   gh run watch "$(gh run list --workflow publish.yml --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
   npm view into-md version
   ```

   The workflow fails before publishing if the tag doesn't match `package.json` or a check fails. Re-run transient failures (or npm-side setup fixes) with `gh run rerun <id>`; a failure that needs a code change needs a new patch version, since the tag is already pushed. It authenticates through npm trusted publishing (no token), and npm attaches provenance automatically. Pre-releases are skipped. `npm pack --dry-run` previews the package contents (`files` in `package.json` plus README, LICENSE, and `package.json`).

A plain `git push` never sends tags, which is how the `v1.0.0` tag once stayed local after its release commit was pushed. `--follow-tags` sends only annotated tags; `npm version` creates those, so if you tag by hand use `git tag -a vX.Y.Z -m vX.Y.Z`.
