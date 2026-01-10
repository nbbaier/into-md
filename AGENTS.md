# Repository Guidelines

## Project Structure & Module Organization
- Source lives in `src/`; `src/index.ts` is the CLI entry point (currently a scaffold) and should orchestrate fetch → extract → convert flow described in `docs/SPEC.md`.
- `docs/SPEC.md` captures the intended CLI behavior, options, and future module layout (fetcher, extractor, converter, tables, images, metadata, cache). Mirror that structure when adding files.
- Root configs: `package.json` (Bun/TypeScript module), `tsconfig.json` (strict, bundler-style ESM), `bun.lock` (deps). Keep new assets alongside the code they serve and prefer co-locating fixtures/tests with their modules.

## Build, Test, and Development Commands
- `bun install` — install dependencies.
- `bun run index.ts -- <url>` — run the CLI locally; currently prints a stub, expand to follow `docs/SPEC.md`.
- `bun test` — use Bun’s test runner once tests are added (no tests yet). Add focused scripts if needed, but favor Bun-native commands over npm aliases.

## Coding Style & Naming Conventions
- Language: TypeScript with ESM imports; respect `tsconfig.json` strictness (`noImplicitOverride`, `noUncheckedIndexedAccess`, etc.).
- Formatting: 2-space indentation; favor small, pure functions and explicit return types. Keep module names descriptive (`fetcher.ts`, `converter.ts`, etc.) to match the spec.
- Error handling: surface actionable messages; prefer typed errors or result objects over silent failures. Keep side effects in the CLI layer; keep helpers deterministic.
- Dependency stance: prefer stdlib/Bun-first utilities; add new deps only when they materially reduce complexity.

## Testing Guidelines
- Runner: Bun’s built-in test runner. Place tests as `*.test.ts` or in `__tests__/` near the code under test.
- Aim for coverage on fetch/extract/convert paths, option parsing, and cache behavior. Use small HTML fixtures for extraction/markdown conversion scenarios.
- Keep tests deterministic: avoid network calls; mock fetch/playwright layers and cache I/O; freeze time where ordering matters.

## Commit & Pull Request Guidelines
- Commit messages follow the existing pattern `type: description` (e.g., `feat: bun init`). Use imperative mood and keep scope narrow.
- PRs should include: summary of changes, linked issues/tasks, notable decisions or trade-offs, and sample CLI output when it changes behavior. Add screenshots only if user-facing formatting is affected.
- Keep diffs focused; prefer separate PRs for refactors vs. feature work. Update docs (`README.md`, `docs/SPEC.md`) alongside code changes that affect them.
