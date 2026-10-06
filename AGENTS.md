# Repository Guidelines

`into-md` is a Bun/TypeScript CLI that fetches a URL and prints clean markdown for LLM context. `README.md` is the source of truth for CLI behavior and flags.

## Module Map

The pipeline runs fetch → extract → convert → frontmatter:

- `src/index.ts` — CLI entry (Commander): parses flags, normalizes the URL, calls `fetchPage`, adds frontmatter, writes output.
- `src/fetcher.ts` — orchestration: cache lookup → static fetch (asks for `text/markdown` first) → auto-detect → Playwright fallback → extract/convert → cache write.
- `src/auto-detect.ts` — decides whether a static page needs a headless browser.
- `src/extractor.ts` — Readability-based main-content extraction and metadata.
- `src/converter.ts` — HTML → markdown (Turndown); calls `tables.ts` (tables → JSON) and `images.ts` (image context).
- `src/metadata.ts` — builds and parses YAML frontmatter.
- `src/cache.ts` — `~/.cache/into-md/` JSON entries, SHA-256 key, 1-hour TTL.
- `src/utils.ts` — linkedom parsing helpers and URL resolution.
- `website/index.tsx` + `alchemy.run.ts` — separate Cloudflare landing page, not part of the CLI.

`fetcher.ts` lazy-loads the pipeline modules and `playwright` with `await import()` to keep startup fast; keep new heavy imports lazy too.

## Commands

- `bun run start -- <url>` — run the CLI from source.
- `bun test`, `bun run typecheck`, `bun run check` (Ultracite/Biome; `bun run fix` autofixes) — CI runs all three.
- `bun run build` — bundle with tsdown into `dist/`.
- Cutting a release (version, tag, npm publish, GitHub release): follow `docs/RELEASING.md`.

## Coding Style

- TypeScript ESM under strict `tsconfig.json` (`noUncheckedIndexedAccess`, `noImplicitOverride`).
- Small, pure helpers; side effects stay in the CLI layer. Surface actionable error messages; prefer typed errors or result objects.
- Prefer stdlib/Bun-first utilities; add deps only when they materially reduce complexity.

## Testing

- Bun's test runner; tests sit beside their module as `*.test.ts` (or in `src/__tests__/`).
- Keep tests deterministic: small HTML fixtures, no network, mock fetch/Playwright and cache I/O.

## Handoffs

Handoff bundles go in `docs/handoffs/<name>-handoff/`. `.gitignore`'s `*-handoff/` is the only exclusion they need: Biome follows `.gitignore`, `tsc` includes only `src/`, `website/`, and root `*.ts`, and `bun test` only searches `src/`. Retired planning docs live in `docs/archive/`.

## Commits & PRs

- Commit messages: `type: description`, imperative, narrow scope.
- PRs: summary, linked issues, notable trade-offs, and sample CLI output when behavior changes.
- Update `README.md` alongside changes to CLI behavior.

# Agent Skills

## Issue Tracker

Issues live in GitHub Issues (nbbaier/into-md); external PRs are not a triage surface. See `docs/agents/issue-tracker.md`.

## Triage Labels

Default label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix), no remapping. See `docs/agents/triage-labels.md`.

## Domain Docs

Single-context layout: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
