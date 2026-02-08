# into-md

A CLI tool that fetches web pages and converts them to clean markdown, optimized for providing context to LLMs.

## Installation

```bash
# Global install (from npm registry)
bun add -g into-md
# or
npm install -g into-md
# or
yarn global add into-md
```

## Usage

```bash
into-md <url>
```

By default, `into-md` **auto-detects** whether a page needs a headless browser. It fetches with a static HTTP request first, inspects the result for SPA signals, and falls back to Playwright if needed.

### Examples

```bash
# Auto-detect (default) — static fetch, falls back to headless if needed
into-md https://example.com/article

# Force headless browser rendering (skip auto-detect probe)
into-md https://spa-site.com/page --js

# Force static HTTP fetch (never launch a browser)
into-md https://example.com/page --no-js

# Skip content extraction, convert full page
into-md https://example.com --raw

# With authentication cookies
into-md https://private-site.com/page --cookies cookies.txt

# Verbose output (includes auto-detect decisions)
into-md https://example.com/article -v
```

## Options

| Flag                    | Description                                               | Default       |
| ----------------------- | --------------------------------------------------------- | ------------- |
| `-o, --output <file>`   | Write output to file instead of stdout                    | stdout        |
| `--js`                  | Force headless browser rendering (skip auto-detect)       | auto-detect   |
| `--no-js`               | Force static HTTP fetch (never launch a browser)          | auto-detect   |
| `--raw`                 | Skip content extraction, convert entire HTML              | disabled      |
| `--cookies <file>`      | Path to cookies file for authenticated requests           | none          |
| `--user-agent <string>` | Custom User-Agent header                                  | browser-like UA |
| `--encoding <encoding>` | Force character encoding (auto-detected by default)       | auto          |
| `--strip-links`         | Remove hyperlinks, keep only anchor text                  | disabled      |
| `--exclude <selectors>` | CSS selectors to exclude (comma-separated)                | none          |
| `--timeout <ms>`        | Request timeout in milliseconds                           | 30000         |
| `--no-cache`            | Bypass response cache                                     | cache enabled |
| `-v, --verbose`         | Show detailed progress information                        | minimal       |
| `-h, --help`            | Show help                                                 | -             |
| `--version`             | Show version                                              | -             |

`--js` and `--no-js` are mutually exclusive — passing both is an error.

## Auto-Detect

When no rendering flag is passed, `into-md` runs a two-stage heuristic to decide whether the page needs a headless browser:

**Stage 1 — Raw HTML inspection** (before Readability extraction):
- Checks for empty SPA root divs (`#root`, `#app`, `#__next`, `#__nuxt`, `#__svelte`)
- Checks for `<noscript>` tags mentioning "javascript" combined with a near-empty body (< 100 chars of body text)

**Stage 2 — Post-extraction content threshold** (after Readability):
- Falls back to headless if extracted text is < 200 characters **and** contains no structural HTML tags (`<article>`, `<p>`, `<pre>`, `<li>`, `<h1>`–`<h6>`)
- Skipped when `--raw` is passed

Non-HTML responses (PDFs, images, etc.) skip auto-detect entirely and use static processing.

## Output Format

### Strategy Line

A strategy summary is printed to stderr on every run:

```
Strategy: static
Strategy: headless
Strategy: auto > static      # auto-detect chose static
Strategy: auto > headless     # auto-detect fell back to headless
```

### Frontmatter

Standard metadata is included as YAML frontmatter:

```yaml
---
title: "Article Title"
description: "Meta description from the page"
author: "Author Name"
date: "2024-01-15"
strategy: "auto>headless"
source: "https://example.com/article"
---
```

The `strategy` field records how the page was fetched: `static`, `headless`, `auto>static`, or `auto>headless`.

### Tables

Tables are converted to fenced JSON blocks for reliable LLM parsing:

```json
{
  "caption": "Quarterly Revenue",
  "headers": ["Quarter", "Revenue", "Growth"],
  "rows": [
    { "Quarter": "Q1", "Revenue": "$1.2M", "Growth": "12%" },
    { "Quarter": "Q2", "Revenue": "$1.5M", "Growth": "25%" }
  ]
}
```

## Caching

Responses are cached in `~/.cache/into-md/` with a 1-hour TTL. Cache entries store the strategy used (`static` or `headless`), so auto-detect can skip re-probing on repeat visits. Use `--no-cache` to bypass.

When a forced flag (`--js` or `--no-js`) doesn't match the cached strategy, the cache is bypassed and the page is re-fetched.

## Playwright & Browser Binaries

Playwright is a required dependency but browser binaries are downloaded on first use. If binaries are missing when needed:

- **Interactive terminal**: prompts to run `bunx playwright install chromium`
- **Non-interactive / CI**: exits with an error and instructions

## Development

```bash
bun install              # Install dependencies
bun run build            # Build the CLI
bun run build:watch      # Build with watch mode
bun run test             # Run tests
bun run check            # Check for lint errors
bun run fix              # Auto-fix lint errors
bun run typecheck        # Type check
```

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **HTML Parsing**: cheerio
- **DOM**: jsdom (auto-detect heuristics)
- **Markdown Conversion**: turndown
- **Content Extraction**: @mozilla/readability
- **Headless Browser**: playwright
- **CLI Framework**: commander

## License

MIT
