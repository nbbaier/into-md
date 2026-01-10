# into-md

A CLI tool that fetches web pages and converts them to clean markdown, optimized for providing context to LLMs.

## Overview

`into-md` fetches a single URL, extracts the main content using readability heuristics, and outputs clean markdown suitable for LLM consumption. It preserves images with context, converts tables to structured JSON, and includes standard metadata.

## Installation

```bash
npm install -g into-md
# or
bunx into-md <url>
```

## Usage

```bash
into-md <url> [options]
```

### Examples

```bash
# Output to stdout
into-md https://example.com/article

# Save to file
into-md https://example.com/article -o article.md

# Use headless browser for JS-rendered content
into-md https://spa-site.com/page --js

# Skip content extraction, convert full page
into-md https://example.com --raw

# With authentication cookies
into-md https://private-site.com/page --cookies cookies.txt

# Verbose output
into-md https://example.com/article -v
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `-o, --output <file>` | Write output to file instead of stdout | stdout |
| `--js` | Use headless browser (Playwright) for JS-rendered content | disabled |
| `--raw` | Skip content extraction, convert entire HTML | disabled |
| `--cookies <file>` | Path to cookies file for authenticated requests | none |
| `--user-agent <string>` | Custom User-Agent header | browser-like UA |
| `--encoding <encoding>` | Force character encoding (auto-detected by default) | auto |
| `--strip-links` | Remove hyperlinks, keep only anchor text | disabled |
| `--exclude <selectors>` | CSS selectors to exclude (comma-separated) | none |
| `--timeout <ms>` | Request timeout in milliseconds | 30000 |
| `--no-cache` | Bypass response cache | cache enabled |
| `-v, --verbose` | Show detailed progress information | minimal |
| `-h, --help` | Show help | - |
| `--version` | Show version | - |

## Output Format

### Frontmatter

Standard metadata is included as YAML frontmatter when available:

```yaml
---
title: "Article Title"
description: "Meta description from the page"
author: "Author Name"
date: "2024-01-15"
source: "https://example.com/article"
---
```

### Content Structure

- **Headings**: Preserved as-is from source (original hierarchy maintained)
- **Text formatting**: Semantic formatting preserved (bold, italic, strikethrough); decorative formatting (colors, underlines) stripped
- **Links**: Preserved as markdown links by default; all relative URLs converted to absolute
- **Code blocks**: Language auto-detected and tagged for syntax highlighting

### Images

Images include alt text, URL, and surrounding context:

```markdown
![Diagram showing the system architecture](https://example.com/images/arch.png)
*Figure 1: The system uses a microservices architecture with three main components.*
```

### Tables

Tables are converted to fenced JSON blocks for reliable LLM parsing:

```json
{
  "caption": "Quarterly Revenue",
  "headers": ["Quarter", "Revenue", "Growth"],
  "rows": [
    {"Quarter": "Q1", "Revenue": "$1.2M", "Growth": "12%"},
    {"Quarter": "Q2", "Revenue": "$1.5M", "Growth": "25%"}
  ]
}
```

### Embedded Content

Embeds (iframes, videos, tweets) are replaced with links:

```markdown
[Embedded video: https://youtube.com/watch?v=xyz123]
```

## Content Extraction

By default, `into-md` uses readability-style heuristics to:

- Extract main article/content area
- Remove navigation, headers, footers, sidebars
- Strip ads, cookie banners, and promotional content
- Filter out irrelevant widgets and scripts

Use `--exclude` to fine-tune extraction with additional CSS selectors:

```bash
into-md https://example.com --exclude ".comments, .related-posts, #newsletter-signup"
```

Use `--raw` to bypass extraction and convert the entire page.

## Caching

Responses are cached locally by default to avoid redundant fetches. Cache location: `~/.cache/into-md/`

- Default TTL: 1 hour
- Use `--no-cache` to fetch fresh content
- Cache is keyed by URL

## Size Warnings

If the output exceeds 100KB, a warning is printed to stderr:

```
Warning: Output is 156KB. Large documents may exceed LLM context limits.
```

## Authentication

For pages requiring authentication, export cookies from your browser and pass them via `--cookies`:

```bash
into-md https://private-docs.company.com/page --cookies ~/cookies.txt
```

Cookie file format: Netscape/Mozilla cookie file format (compatible with browser extensions like EditThisCookie).

## Error Handling

- **403/Blocked**: Clear error message suggesting `--user-agent` option
- **Timeouts**: Respects `--timeout` flag, defaults to 30 seconds
- **Encoding issues**: Auto-detects from headers/meta, converts to UTF-8; use `--encoding` to override

## Technical Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **HTML Parsing**: cheerio
- **Markdown Conversion**: turndown
- **Content Extraction**: @mozilla/readability
- **Headless Browser**: playwright (optional, for `--js` mode)
- **CLI Framework**: commander or yargs

## Project Structure

```
into-md/
├── src/
│   ├── index.ts          # CLI entry point
│   ├── fetcher.ts        # URL fetching (static + headless)
│   ├── extractor.ts      # Content extraction with readability
│   ├── converter.ts      # HTML to markdown conversion
│   ├── tables.ts         # Table to JSON conversion
│   ├── images.ts         # Image context extraction
│   ├── metadata.ts       # Frontmatter generation
│   └── cache.ts          # Response caching
├── package.json
├── tsconfig.json
└── SPEC.md
```

## Future Considerations (Out of Scope for v1)

- Batch processing of multiple URLs
- Same-domain crawling with depth control
- Config file for persistent preferences
- Prebuilt binaries via GitHub releases
- Full authentication support (headers, basic auth)
