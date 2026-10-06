# Releasing

Releases go out from a clean, CI-green `main`. Pick the bump by semver: fixes → `patch`, new flags or behavior → `minor`, breaking CLI changes → `major`.

1. **Changelog.** In `CHANGELOG.md`, rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`, add a fresh empty `## [Unreleased]` above it, and add a `[X.Y.Z]: https://github.com/nbbaier/into-md/releases/tag/vX.Y.Z` link at the bottom. Commit it (`docs: changelog for X.Y.Z`). `npm version` refuses a dirty tree, so this commit comes first.

2. **Version, build, push.**

   ```bash
   bun run release:patch   # or release:minor / release:major
   ```

   This bumps `package.json`, commits `vX.Y.Z`, creates an annotated `vX.Y.Z` tag, builds `dist/`, and runs `git push --follow-tags`. Confirm the tag reached GitHub with `git ls-remote --tags origin vX.Y.Z`.

3. **Publish to npm.**

   ```bash
   npm publish
   ```

   `files` in `package.json` limits the package to `dist/` and `CHANGELOG.md`; `npm pack --dry-run` previews it.

4. **GitHub release**, with the changelog entry as notes:

   ```bash
   v=X.Y.Z
   awk -v v="$v" '$0 ~ "^## \\[" v "\\]" {on=1; next} /^## \[/ {on=0} on' CHANGELOG.md > /tmp/notes.md
   gh release create "v$v" --title "v$v" --notes-file /tmp/notes.md
   ```

A plain `git push` never sends tags, which is how the `v1.0.0` tag once stayed local after its release commit was pushed. `--follow-tags` sends only annotated tags; `npm version` creates those, so if you tag by hand use `git tag -a vX.Y.Z -m vX.Y.Z`.
