# into-md

A CLI tool that fetches web pages and converts them to clean markdown, optimized for providing context to LLMs.

## Installation

```bash
bun install
```

## Usage

```bash
# Run directly
bun run start -- <url>

# Or build and run the CLI
bun run build
./dist/index.mjs <url>
```

### Examples

```bash
# Output to stdout
bun run start -- https://example.com/article

# Save to file
bun run start -- https://example.com/article -o article.md

# Use headless browser for JS-rendered content
bun run start -- https://spa-site.com/page --js

# Skip content extraction, convert full page
bun run start -- https://example.com --raw

# With authentication cookies
bun run start -- https://private-site.com/page --cookies cookies.txt

# Verbose output
bun run start -- https://example.com/article -v
```

## Options

| Flag                    | Description                                               | Default         |
| ----------------------- | --------------------------------------------------------- | --------------- |
| `-o, --output <file>`   | Write output to file instead of stdout                    | stdout          |
| `--js`                  | Use headless browser (Playwright) for JS-rendered content | disabled        |
| `--raw`                 | Skip content extraction, convert entire HTML              | disabled        |
| `--cookies <file>`      | Path to cookies file for authenticated requests           | none            |
| `--user-agent <string>` | Custom User-Agent header                                  | browser-like UA |
| `--encoding <encoding>` | Force character encoding (auto-detected by default)       | auto            |
| `--strip-links`         | Remove hyperlinks, keep only anchor text                  | disabled        |
| `--exclude <selectors>` | CSS selectors to exclude (comma-separated)                | none            |
| `--timeout <ms>`        | Request timeout in milliseconds                           | 30000           |
| `--no-cache`            | Bypass response cache                                     | cache enabled   |
| `-v, --verbose`         | Show detailed progress information                        | minimal         |
| `-h, --help`            | Show help                                                 | -               |
| `--version`             | Show version                                              | -               |

## Output Format

### Frontmatter

Standard metadata is included as YAML frontmatter:

```yaml
---
title: "Article Title"
description: "Meta description from the page"
author: "Author Name"
date: "2024-01-15"
source: "https://example.com/article"
---
```

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

## Development

```bash
bun run build         # Build the CLI
bun run build:watch   # Build with watch mode
bun run test          # Run tests
bun run lint          # Check for lint errors
bun run fix           # Auto-fix lint errors
bun run typecheck     # Type check
```

## Technical Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **HTML Parsing**: cheerio
- **Markdown Conversion**: turndown
- **Content Extraction**: @mozilla/readability
- **Headless Browser**: playwright (for `--js` mode)
- **CLI Framework**: commander

## Project Structure

```
into-md/
├── src/
│   ├── index.ts      # CLI entry point
│   ├── fetcher.ts    # URL fetching (static + headless)
│   ├── extractor.ts  # Content extraction with readability
│   ├── converter.ts  # HTML to markdown conversion
│   ├── tables.ts     # Table to JSON conversion
│   ├── images.ts     # Image context extraction
│   ├── metadata.ts   # Frontmatter generation
│   └── cache.ts      # Response caching
├── docs/
│   └── SPEC.md       # Full specification
└── package.json
```

## License

MIT
