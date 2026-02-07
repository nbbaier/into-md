# Spec: Auto-Detect Rendering Strategy

## Overview

Invert the current `--js` opt-in model so that **auto-detection is the default**. The CLI will automatically determine whether a page needs headless browser rendering, with explicit flags as escape hatches.

## CLI API

| Flag | Behavior |
|------|----------|
| *(none)* | **Auto-detect**: static fetch first, inspect result, fall back to Playwright if needed |
| `--js` | **Force headless**: skip static probe, go straight to Playwright |
| `--no-js` | **Force static**: never launch a browser, HTTP fetch only |

- `--js` and `--no-js` are **mutually exclusive** — error if both are passed.
- The existing `--js` flag changes from "opt-in to headless" to "force headless, skip probe."

### Interaction with `--raw`

When `--raw` is passed (skip Readability, convert entire HTML):
- **Stage 1** heuristics still run (raw HTML inspection).
- **Stage 2** is skipped entirely since Readability is not used.

## Playwright Dependency

- **Stays as a required dependency** in `package.json` (status quo).
- Browser binaries download on first headless use via Playwright's built-in mechanism.
- If browser binaries are missing when auto-detect or `--js` needs them:
  - **If TTY** (`process.stdin.isTTY` is true and `CI` env var is not set): interactive prompt — "Browser binaries not found. Run `bunx playwright install chromium`? (y/n)". Execute if confirmed, exit with instructions if declined.
  - **If non-TTY** (piped, CI, editor integration): skip prompt, exit with error and instructions to run `bunx playwright install chromium`.

## Architecture

### Mode Type

Replace the current `useJs?: boolean` with a tri-state mode:

```typescript
type RenderMode = "auto" | "static" | "headless";
```

- `--no-js` → `"static"`
- `--js` → `"headless"`
- *(default)* → `"auto"`

### Orchestration Layer

Introduce a new orchestration function above `fetchPage()` that owns the full decision flow:

```
orchestrate(url, mode, options)
  ├─ cache read (respecting mode/strategy match)
  ├─ if mode === "static":  fetchWithHttp → extract → done
  ├─ if mode === "headless": fetchWithBrowser → extract → done
  ├─ if mode === "auto":
  │    ├─ fetchWithHttp (no cache write)
  │    ├─ Stage 1 heuristics on raw HTML
  │    │    ├─ triggers → fetchWithBrowser → extract → cache write → done
  │    │    └─ passes → extract with Readability
  │    ├─ Stage 2 threshold check on extracted content
  │    │    ├─ triggers → fetchWithBrowser → extract (skip detection) → cache write → done
  │    │    └─ passes → cache write → done
  └─ single cache write of final result only
```

**Key change**: `fetchPage()` no longer writes to cache. The orchestrator writes **only the final successful result**, preventing the intermediate static probe of a SPA page from being cached.

### FetchResult

Extend `FetchResult` to include the strategy used:

```typescript
interface FetchResult {
  html: string;
  finalUrl: string;
  fromCache: boolean;
  strategyUsed: "static" | "headless";  // NEW
}
```

### Non-HTML Responses

Auto-detect is skipped for non-HTML responses. If the `Content-Type` header does not indicate HTML (`text/html` or `application/xhtml+xml`), proceed with static processing regardless of mode. PDFs, images, and other binary responses are never sent to Playwright.

## Auto-Detect Decision Tree

### Stage 1: Raw HTML Heuristics (pre-Readability)

After the static HTTP fetch, inspect the raw HTML for SPA signals **before** running Readability extraction.

**"Body text" is defined as:** extract `<body>` content only (exclude `<head>`), strip all `<script>` and `<style>` tags and their contents, collapse whitespace, count remaining characters. (Not "visible text" — this is unrelated to CSS visibility.)

1. **Empty root div check**: Body contains a known SPA root element with no meaningful child content. "Meaningful" means non-whitespace text **excluding** common loading indicators (`Loading`, `Loading...`, spinner text). Non-empty child elements (excluding `<script>`/`<style>`) also count as meaningful.
   - `<div id="root"></div>`
   - `<div id="app"></div>`
   - `<div id="__next"></div>`
   - `<div id="__nuxt"></div>`
   - `<div id="__svelte"></div>`

2. **Noscript + empty body check**: A `<noscript>` tag's **text content** contains the word "javascript" (case-insensitive) **AND** the body has fewer than 100 characters of body text. **Exception**: if the noscript text is inside a known cookie banner or consent wrapper (heuristic: parent has class/id containing "cookie", "consent", "banner"), do not trigger.

If **either** check triggers → skip Readability, fall back to Playwright immediately.

### Stage 2: Post-Readability Content Threshold

If Stage 1 passes (no obvious SPA signals), proceed with the normal pipeline. After Readability extraction, check content quality:

- Fall back to Playwright if **both** conditions are true:
  - Extracted text content is **< 200 characters**
  - The extracted HTML contains **no** `<article>`, `<p>`, `<pre>`, `<li>`, or heading (`<h1>`-`<h6>`) tags
- This avoids false positives on legitimately short pages (e.g., press notes, stub articles, code snippets, list pages) that have real structural HTML, while still catching pages where Readability pulled out only boilerplate.
- **Skipped when `--raw` is passed** (Readability is not used in raw mode).

### Fallback Behavior

When auto-detect triggers a Playwright fallback:

1. Launch Playwright with the **same configuration** as the initial static fetch (cookies, user-agent, timeout).
2. Navigate with `waitUntil: "load"` first. Then attempt `page.waitForLoadState("networkidle")` with a shorter timeout (half the configured timeout, minimum 5 seconds). If `networkidle` times out, proceed with the content available after `load`. This avoids a double navigation.
3. Run the extraction pipeline on the browser-rendered HTML. **Skip auto-detect heuristics** — proceed directly to Readability/extraction. This prevents re-triggering a detection loop if the headless HTML still contains SPA markers.

## Caching

### Cache Entry Format

Extend the existing `CachedResponse` to include strategy and redirect metadata:

```typescript
interface CachedResponse {
  url: string;
  finalUrl: string;       // NEW — preserves redirect target for URL resolution
  fetchedAt: number;
  content: string;
  strategy: "static" | "headless";  // NEW
}
```

### Backward Compatibility

Existing cache entries will not have `strategy` or `finalUrl` fields. Handle as follows:
- Missing `strategy`: treat as `"unknown"` — auto-detect will **not** skip probing, will re-fetch and overwrite the entry with a proper strategy.
- Missing `finalUrl`: fall back to `url` field (current behavior).

### Cache Behavior

- **On cache hit (auto-detect)**: If the cached entry exists, is valid (within TTL), and has a known `strategy`, use it directly. The stored `strategy` field tells auto-detect what worked last time — skip re-probing.
- **On cache hit (forced flag)**: If a forced flag (`--js` or `--no-js`) is set and the cached strategy **does not match** the forced mode, **bypass the cache** and re-fetch with the forced strategy. This ensures `--no-js` never returns headless-cached content and vice versa.
- **On cache miss (auto-detect)**: Only cache the **final successful result** (not the intermediate static probe if it was sparse). Store the strategy that produced the result.
- **On cache miss (`--js` / `--no-js`)**: Cache normally with the forced strategy.
- **Cache key**: Remains URL-only (SHA256 hash). The strategy is metadata on the entry, not part of the key.

### Known Limitation

Cache key is URL-only, but content can vary by cookies and user-agent. This is a known limitation — different cookie/UA combinations for the same URL will overwrite each other in the cache. Documented here; not addressed in v1.

## Output

### stderr Strategy Line

Always print a one-line strategy summary to stderr. This line is printed **before** any `--verbose` logs to avoid interleaving:

```
Strategy: static
Strategy: headless
Strategy: auto > static      # auto-detect chose static (content was sufficient)
Strategy: auto > headless     # auto-detect fell back to headless
```

When `--verbose` is also set, detailed detection logs follow after the strategy line.

### Frontmatter Metadata

Add a `strategy` field to the YAML frontmatter in every output. This requires adding `strategy` to `FrontmatterInput` in `metadata.ts`:

```yaml
---
title: "Page Title"
description: "..."
source: "https://example.com"
strategy: "auto>headless"
---
```

Values: `static`, `headless`, `auto>static`, `auto>headless`.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `--js` + `--no-js` both passed | Exit with error: "Cannot use --js and --no-js together" |
| Browser binaries missing (TTY) | Interactive prompt: "Run `bunx playwright install chromium`? (y/n)" |
| Browser binaries missing (non-TTY / CI) | Exit with error and instructions |
| `--js` passed but `playwright` package not installed | Error (current behavior): "JS mode requested but playwright is not installed" |
| Playwright fallback still produces sparse content | Return the headless result as-is with `strategy: auto>headless` — best effort |
| `networkidle` times out during headless fetch | Use content from `load` event, proceed normally |
| Non-HTML Content-Type response | Skip auto-detect, process as static |

## Thresholds

All thresholds are hard-coded for v1. Configurable flags can be added later if users hit edge cases.

| Threshold | Value | Used In |
|-----------|-------|---------|
| Stage 1 body text minimum | 100 characters | Noscript + empty body check |
| Stage 2 Readability content minimum | 200 characters | Post-extraction content threshold |
| Stage 2 structural tag list | `<article>`, `<p>`, `<pre>`, `<li>`, `<h1>`-`<h6>` | Short-page false positive guard |
| networkidle timeout | half of configured timeout, min 5s | Headless fetch fallback |

## Per-Domain Preferences

**Not in scope for v1.** Cache metadata already remembers strategy per URL for repeat visits, which covers the most common case. Domain-level config can be revisited later if needed.
