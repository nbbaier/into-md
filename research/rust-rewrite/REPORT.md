# Would a Rust rewrite make into-md faster?

**Short answer:** Yes. A Rust port of the static pipeline was **21–100× faster end to end** and used **16–20× less memory** in these benchmarks. Most of that gap comes from two problems we can fix in TypeScript, though: JSDOM, and importing every dependency at startup. Fixing those in TS should get roughly **4–6× faster**. That is about a fifth of the Rust gain, for a small fraction of the work.

Recommendation: do the TS fixes (Phase 1 below) first. Only port to Rust if into-md will be called in tight loops, such as batch crawls or agents calling it as a tool, where the remaining ~150–700 ms per call matters.

---

## Method

- **Machine:** 4 vCPU Intel Xeon @ 2.1 GHz, Linux 6.18. Bun 1.3.14, Node 22.22, rustc 1.97.
- **Fixtures:** six real pages fetched once by `fetch-fixtures.sh` and served from a local `http.server`, so network time is excluded from the main numbers. They are not committed because they are third-party content.

  | fixture | size | page |
  |---|---|---|
  | small-hn | 34 KB | news.ycombinator.com |
  | medium-essay | 78 KB | paulgraham.com/greatwork |
  | medium-blog | 95 KB | blog.rust-lang.org |
  | large-pydocs | 173 KB | Python asyncio-task docs |
  | large-mdn | 239 KB | MDN `Array` reference |
  | xlarge-wiki | 1,024 KB | Wikipedia "Rust (programming language)" |

- **TS baseline:** the current `src/` running the default auto mode on the static path (stage 1 detection → Readability extraction → stage 2 detection → convert). It was run two ways: the published `dist/index.mjs` under Node, and `src/index.ts` under Bun.
- **Rust prototype** (`rust/`, 420 lines): the same auto-mode static pipeline, using `ureq` for fetching, `dom_query` for the DOM, `dom_smoothie` (a port of Readability.js) for extraction and `htmd` (Turndown-style) for conversion. It has custom rules matching `converter.ts`: tables become JSON, images get figure captions, URLs are made absolute, links can be stripped, and embeds are kept. **Not ported:** headless/Playwright, the cache, cookies and `--encoding`.
- **TS + linkedom experiment** (`bench-ts-linkedom.ts`): the TS pipeline with JSDOM swapped for `linkedom` and fewer re-parses. This tests how much speed is available without a rewrite.
- **Tools:** `hyperfine` for CLI runs (8–10 runs, warmed up), in-process `performance.now()` / `Instant` medians of 15 runs for per-stage timings, and `getrusage` for peak RSS.
- **Reproduce:** run `./run-benchmarks.sh`.

## Results

### 1. Startup (`--version` / `--help`)

| impl | mean |
|---|---:|
| TS, Node (`dist/index.mjs`) | 838 ms |
| TS, Bun (`src/index.ts`) | 819 ms |
| Rust | 2 ms |

All of the TS startup time is spent loading modules, because `index.ts` statically imports the whole pipeline:

| `import()` under Node | mean |
|---|---:|
| `node -e 0` (baseline) | 25 ms |
| jsdom | **692 ms** |
| cheerio | 226 ms |
| turndown | 69 ms |
| commander | 62 ms |
| @mozilla/readability | 40 ms |
| everything used today, together | **890 ms** |
| linkedom + cheerio + turndown + readability + commander | 319 ms |
| linkedom + turndown + readability + commander (no cheerio) | 185 ms |

This also means **a cache hit costs 812 ms in TS**, almost all of it imports. A Rust cache hit would be about startup plus a file read, roughly 2–3 ms. That figure is estimated, because the cache was not ported.

### 2. End-to-end CLI: local HTTP fetch → markdown file (auto mode, `--no-cache`)

| fixture | TS Node | TS Bun | Rust | Rust speedup |
|---|---:|---:|---:|---:|
| small-hn (34 KB) | 1,381 ms | 1,373 ms | 13.7 ms | **100×** |
| medium-essay (78 KB) | 1,489 ms | 1,489 ms | 14.7 ms | **101×** |
| large-mdn (239 KB) | 1,939 ms | 2,093 ms | 34.3 ms | **56×** |
| xlarge-wiki (1 MB) | 4,128 ms | 4,225 ms | 194.5 ms | **21×** |

Node and Bun perform the same. The runtime is not the bottleneck.

### 3. Per-stage time inside one process (warm, median of 15)

Times in ms. Each cell is stage1 / extract / stage2 / convert, and the bold number is the total.

| fixture | TS + JSDOM (today) | TS + linkedom | Rust |
|---|---|---|---|
| small-hn | 36 / 121 / 25 / 6 = **188** | 5 / 21 / 0 / 5 = **34** | 1.1 / 4.5 / 0.8 / 1.0 = **7.6** |
| medium-essay | 82 / 206 / 50 / 104 = **454** | 3 / 22 / 0 / 29 = **54** | 0.7 / 7.9 / 0.4 / 1.0 = **10.0** |
| medium-blog | 74 / 291 / 67 / 26 = **465** | 8 / 43 / 0 / 24 = **82** | 2.7 / 11.2 / 2.2 / 2.8 = **19.3** |
| large-pydocs | 144 / 695 / 102 / 77 = **1,031** | 22 / 154 / 0 / 92 = **274** | 5.6 / 28.3 / 3.6 / 5.0 = **43.2** |
| large-mdn | 108 / 492 / 58 / 43 = **700** | 10 / 87 / 0 / 60 = **156** | 4.3 / 17.9 / 1.7 / 2.6 = **26.4** |
| xlarge-wiki | 507 / 2,060 / 295 / 434 = **3,923** | 58 / 354 / 0 / 300 = **732** | 20.9 / 106.1 / 22.1 / 25.6 = **175** |

Ratios: JSDOM → Rust is **22–45×**, JSDOM → linkedom is **4–8×**, and linkedom → Rust is **4–6×**.

- **The bottleneck is JSDOM.** The auto path builds 4 JSDOM documents and makes 1 clone per page. Turndown and cheerio then parse the HTML twice more.
- **The linkedom variant is slightly favoured.** It skips the separate stage 2 parse and reuses Readability's `textContent`, which a real TS fix would also do.
- **Rust's main remaining cost is Readability scoring** (`extract`), not parsing.

### 4. Peak memory (RSS, end-to-end CLI)

| fixture | TS Node | TS Bun | Rust |
|---|---:|---:|---:|
| small-hn | 194 MB | 227 MB | 9.9 MB |
| medium-essay | 202 MB | 285 MB | 9.9 MB |
| large-mdn | 235 MB | 323 MB | 11.5 MB |
| xlarge-wiki | 477 MB | 691 MB | 29.8 MB |

### 5. Output parity

This compares the TS and Rust markdown output word by word (`parity.py`, `difflib` ratio over `\w+` tokens).

| fixture | similarity |
|---|---:|
| small-hn | 1.000 |
| medium-blog | 1.000 |
| medium-essay | 0.998 |
| large-mdn | 0.994 |
| xlarge-wiki | 0.987 |
| large-pydocs | 0.948 |

The differences are style, not content:

- `htmd` does not escape `_` or `=` the way Turndown does (`say_after` vs `say\_after`).
- Emphasis uses `*x*` instead of `_x_`.
- REPL `>>>` prompts are not escaped.

Swapping JSDOM for linkedom gave **identical** output on 5 of 6 fixtures and 0.998 on MDN.

### 6. Size and distribution

| | TS | Rust |
|---|---|---|
| Artifact | 30 KB `dist/index.mjs` plus a Node runtime plus `node_modules`: jsdom 12 MB, playwright(-core) 19 MB, cheerio 1.6 MB (the repo's full `node_modules` is 782 MB, mostly dev and deploy deps) | single 4.9 MB static binary (LTO, stripped) |
| `bun build --compile` | **fails at runtime** (`Cannot find module '../data/patch.json'`, a JSDOM data file) | n/a |

## Real-world context

- **Network:** fetching the same pages over the internet took **0.2–0.7 s** each. So for one interactive call on MDN, the user waits about 0.25 + 1.94 ≈ **2.2 s with TS today** compared with ≈ **0.28 s with Rust**. That is still about 8× as seen by the user. After the TS fixes it would be roughly 0.25 + 0.34 ≈ 0.6 s.
- **Headless path:** Chromium launch plus `goto` plus `networkidle` took **1.9–3.0 s** for one local page. Rust only speeds up the post-processing here, which is a small share of the total. Separately, TS `ensureBrowserInstalled()` launches and closes Chromium once just to check it exists, then `fetchWithBrowser()` launches it again. That wastes **~150–660 ms** on every headless run (measured launch cost), and it is fixable in TS.

## What a full Rust rewrite would cost

- **Headless mode:** there is no Rust equivalent of Playwright's `install chromium`. The options are:
  - `chromiumoxide` or another CDP client, which needs a system Chrome or its own downloader;
  - keeping a Node/Playwright sidecar only for `--js`.

  Either way it is the hardest part, and it is also the path where Rust helps least.
- **Distribution:** today `npx into-md` just works. Rust needs prebuilt binaries per OS and architecture, through `cargo-dist` with an npm installer or platform `optionalDependencies`, plus a CI release matrix.
- **Output drift:** `dom_smoothie` and `htmd` are different implementations from Readability.js and Turndown. The tests and fixtures in `src/*.test.ts` would need re-baselining, and escaping or formatting differences would reach users.
- **Size:** about 1,570 lines of non-test TS to port (cache, cookies, encoding and frontmatter are straightforward). The prototype's 420 lines cover the hot path.
- **Middle option:** a napi-rs native module that keeps the CLI and Playwright in TS but moves extract and convert to Rust. That still needs per-platform prebuilds, and it still pays Node startup (~25 ms baseline, plus commander and playwright imports if they are not lazy).

## Recommendation

**Phase 1: TS fixes (low effort, ~4–6× expected)**

1. Lazy-load the heavy dependencies (`await import()` in `fetcher.ts` / `extractor.ts`) so `--version`, `--help` and cache hits skip them. This should bring a cache hit down from ~810 ms to ~100 ms (estimated from the import measurements).
2. Replace JSDOM with linkedom (measured at 4–8× faster processing, with identical output on 5 of 6 fixtures). Also parse once: share one document between stage 1, metadata and the exclude step, clone it for Readability, and compute stage 2 from `article.textContent` instead of re-parsing.
3. Drop cheerio from `converter.ts` and run the table, image and link passes on the same linkedom DOM, then hand Turndown the node. This saves ~130 ms of imports and one parse.
4. Remove the extra Chromium launch in `ensureBrowserInstalled()`: catch the launch error in `fetchWithBrowser()` instead.

Estimated result: about 185 ms of imports plus 34–730 ms of processing. For example, MDN would take ~0.34 s instead of 1.94 s. This estimate is the sum of measured components, not measured end to end.

**Phase 2: Rust, only if needed.** It is worth it if into-md becomes a batch, crawling or agent-loop tool, where Rust's remaining 4–6× over optimized TS and ~20× lower memory add up. The prototype here is a working starting point. Keep headless as a Node sidecar at first.

## Files

| file | purpose |
|---|---|
| `fetch-fixtures.sh` | downloads the benchmark pages |
| `run-benchmarks.sh` | reproduces all numbers |
| `bench-ts.ts` | per-stage timings of the current TS pipeline |
| `bench-ts-linkedom.ts` | the linkedom experiment (`bun add --no-save linkedom`) |
| `dump-ts.ts`, `parity.py` | output parity check |
| `peak-rss.py` | peak RSS of a command |
| `rust/` | Rust prototype (`into-md-rs <url>`, or `--file x.html --repeat N` for stage timings) |
| `results/` | hyperfine markdown tables and raw JSON |
