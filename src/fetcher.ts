import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { Browser } from "playwright";
import {
  type CacheMetadata,
  type CacheOptions,
  type ExtractionOptions,
  readFromCache,
  writeToCache,
} from "./cache";
// The HTML pipeline (linkedom, Readability, Turndown) is imported lazily so
// that cache hits and markdown responses never pay for loading it.
import type { ExtractedContent } from "./extractor";

function extractionOptionsFrom(options: FetchOptions): ExtractionOptions {
  const result: ExtractionOptions = {};
  if (options.raw) {
    result.raw = true;
  }
  if (options.excludeSelectors?.length) {
    result.excludeSelectors = options.excludeSelectors;
  }
  if (options.stripLinks) {
    result.stripLinks = true;
  }
  if (options.encoding) {
    result.encoding = options.encoding;
  }
  return result;
}

type RenderMode = "auto" | "static" | "headless";

interface FetchOptions {
  cache?: Partial<CacheOptions>;
  cookiesPath?: string;
  encoding?: string;
  excludeSelectors?: string[];
  logBuffer?: string[];
  mode?: RenderMode;
  noCache?: boolean;
  onStrategyResolved?: (strategy: "static" | "headless" | "markdown") => void;
  raw?: boolean;
  stripLinks?: boolean;
  timeoutMs?: number;
  userAgent?: string;
  verbose?: boolean;
}

interface FetchResult {
  finalUrl: string;
  fromCache: boolean;
  markdown: string;
  /** Token count from x-markdown-tokens header, if present */
  markdownTokens?: number;
  metadata: CacheMetadata;
  strategyUsed: "static" | "headless" | "markdown";
}

interface CookieRecord {
  domain: string;
  expires: number;
  name: string;
  path: string;
  secure: boolean;
  value: string;
}

/** Raw HTTP result before the extract→convert pipeline runs */
interface InternalFetchResult {
  contentType?: string;
  finalUrl: string;
  fromCache: boolean;
  html: string;
  markdown?: string;
  markdownTokens?: number;
  strategyUsed: "static" | "headless" | "markdown";
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36";

const DEFAULT_TIMEOUT_MS = 30_000;

const logVerbose = (message: string, options?: FetchOptions): void => {
  if (!options?.verbose) {
    return;
  }
  if (options.logBuffer) {
    options.logBuffer.push(message);
    return;
  }
  console.error(message);
};

function parseNetscapeCookieLine(
  line: string
): { record: CookieRecord; headerPair: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const parts = trimmed.split("\t");
  if (parts.length < 7) {
    return null;
  }

  const [domain, , path, secureFlag, expires, name, value] = parts;
  if (!(domain && path && secureFlag && expires && name && value)) {
    return null;
  }

  return {
    headerPair: `${name}=${value}`,
    record: {
      domain,
      expires: Number(expires),
      name,
      path,
      secure: secureFlag.toLowerCase() === "true",
      value,
    },
  };
}

async function parseCookiesFile(cookiesPath?: string): Promise<{
  header: string | undefined;
  playwrightCookies: CookieRecord[];
}> {
  if (!cookiesPath) {
    return { header: undefined, playwrightCookies: [] };
  }
  let content: string;
  try {
    content = await readFile(cookiesPath, "utf8");
  } catch (error) {
    throw new Error(
      `Unable to read cookies file "${basename(cookiesPath)}": ${String(error)}`,
      { cause: error }
    );
  }

  const entries: CookieRecord[] = [];
  const headerPairs: string[] = [];
  for (const line of content.split("\n")) {
    const parsed = parseNetscapeCookieLine(line);
    if (!parsed) {
      continue;
    }
    entries.push(parsed.record);
    headerPairs.push(parsed.headerPair);
  }

  return {
    header: headerPairs.length ? headerPairs.join("; ") : undefined,
    playwrightCookies: entries,
  };
}

async function fetchWithHttp(
  url: string,
  options: FetchOptions
): Promise<InternalFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  const { header: cookiesHeader } = await parseCookiesFile(options.cookiesPath);
  const headers = new Headers({
    Accept: "text/markdown, text/html",
    "Accept-Encoding": "identity",
    "User-Agent": options.userAgent ?? DEFAULT_USER_AGENT,
  });
  if (cookiesHeader) {
    headers.set("Cookie", cookiesHeader);
  }

  try {
    const response = await fetch(url, {
      headers,
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Request failed with status ${response.status}. If blocked, try --user-agent.`
      );
    }

    const finalUrl = response.url;
    const contentType = response.headers.get("Content-Type") ?? undefined;
    const buffer = await response.arrayBuffer();
    const decoder = new TextDecoder(options.encoding);
    const body = decoder.decode(buffer);

    if (contentType && MARKDOWN_CONTENT_TYPE_RE.test(contentType)) {
      const tokensHeader = response.headers.get("x-markdown-tokens");
      logVerbose(
        "Server returned text/markdown via content negotiation",
        options
      );
      return {
        contentType,
        finalUrl,
        fromCache: false,
        html: "",
        markdown: body,
        markdownTokens: tokensHeader ? Number(tokensHeader) : undefined,
        strategyUsed: "markdown",
      };
    }

    return {
      contentType,
      finalUrl,
      fromCache: false,
      html: body,
      strategyUsed: "static",
    };
  } catch (error) {
    const prefix =
      error instanceof Error && error.name === "AbortError"
        ? "Request timed out"
        : "Request failed";
    throw new Error(`${prefix}: ${String(error)}`, { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithBrowser(
  url: string,
  options: FetchOptions
): Promise<InternalFetchResult> {
  let playwright: typeof import("playwright") | null = null;
  try {
    playwright = await import("playwright");
  } catch (error) {
    throw new Error(
      `JS mode requested but playwright is not installed. Install it and retry. (${String(
        error
      )})`,
      { cause: error }
    );
  }

  const { playwrightCookies } = await parseCookiesFile(options.cookiesPath);
  const browser = await launchBrowser(playwright);
  try {
    const context = await browser.newContext({
      userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
    });

    if (playwrightCookies.length) {
      await context.addCookies(
        playwrightCookies.map((cookie) => ({
          ...cookie,
          httpOnly: false,
          sameSite: "Lax" as const,
        }))
      );
    }

    const page = await context.newPage();
    await page.goto(url, {
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      waitUntil: "load",
    });

    const networkidleTimeout = Math.max(
      5000,
      Math.floor((options.timeoutMs ?? DEFAULT_TIMEOUT_MS) / 2)
    );

    try {
      await page.waitForLoadState("networkidle", {
        timeout: networkidleTimeout,
      });
    } catch {
      // Ignore timeout - networkidle may not be reached, continue with page content
    }

    const html = await page.content();
    const finalUrl = page.url();

    return { finalUrl, fromCache: false, html, strategyUsed: "headless" };
  } finally {
    await browser.close();
  }
}

const MISSING_BROWSER_MESSAGE =
  "Browser binaries not found. Run `bunx playwright install chromium`";

/**
 * Launches Chromium. A launch failure is treated as missing browser binaries:
 * interactive users are offered an install, after which the launch is retried.
 */
async function launchBrowser(
  playwright: typeof import("playwright")
): Promise<Browser> {
  try {
    return await playwright.chromium.launch({ headless: true });
  } catch (error) {
    await offerBrowserInstall(error);
    return await playwright.chromium.launch({ headless: true });
  }
}

async function offerBrowserInstall(launchError: unknown): Promise<void> {
  if (!process.stdin.isTTY || process.env.CI) {
    throw new Error(MISSING_BROWSER_MESSAGE, { cause: launchError });
  }

  const readline = await import("node:readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  const answer = await new Promise<string>((resolve) => {
    rl.question(
      "Browser binaries not found. Run `bunx playwright install chromium`? (y/n) ",
      resolve
    );
  });
  rl.close();

  if (answer.toLowerCase() !== "y") {
    throw new Error(MISSING_BROWSER_MESSAGE, { cause: launchError });
  }

  console.error("Installing chromium...");
  const { $ } = await import("bun");
  await $`bunx playwright install chromium`;
}

async function tryGetFromCache(
  url: string,
  options: FetchOptions
): Promise<FetchResult | null> {
  if (options.noCache) {
    return null;
  }

  const cached = await readFromCache(
    url,
    { enabled: !options.noCache, ...options.cache },
    extractionOptionsFrom(options)
  );
  if (!cached) {
    return null;
  }

  logVerbose("Cache hit", options);
  return {
    finalUrl: cached.finalUrl,
    fromCache: true,
    markdown: cached.markdown,
    metadata: cached.metadata,
    strategyUsed: "static",
  };
}

const HTML_CONTENT_TYPE_RE = /text\/html|application\/xhtml\+xml/i;
const MARKDOWN_CONTENT_TYPE_RE = /text\/markdown/i;

interface FetchModeResult {
  /** Content already extracted while auto-detecting, ready to convert */
  extracted?: ExtractedContent;
  finalUrl: string;
  html: string;
  markdown?: string;
  markdownTokens?: number;
  strategy: "static" | "headless" | "markdown";
}

async function fetchHeadless(
  url: string,
  options: FetchOptions
): Promise<FetchModeResult> {
  const result = await fetchWithBrowser(url, options);
  return { finalUrl: result.finalUrl, html: result.html, strategy: "headless" };
}

async function fetchWithAutoDetect(
  url: string,
  options: FetchOptions
): Promise<FetchModeResult> {
  logVerbose("Auto-detect mode: starting static probe", options);

  const staticResult = await fetchWithHttp(url, options);

  if (staticResult.strategyUsed === "markdown") {
    return {
      finalUrl: staticResult.finalUrl,
      html: "",
      markdown: staticResult.markdown,
      markdownTokens: staticResult.markdownTokens,
      strategy: "markdown",
    };
  }

  const { html: rawHtml, finalUrl } = staticResult;

  if (
    staticResult.contentType &&
    !HTML_CONTENT_TYPE_RE.test(staticResult.contentType)
  ) {
    logVerbose("Auto-detect: non-HTML content type, using static", options);
    return { finalUrl, html: rawHtml, strategy: "static" };
  }

  const [{ detectNeedForBrowser }, { extractContent }, { parseDocument }] =
    await Promise.all([
      import("./auto-detect"),
      import("./extractor"),
      import("./utils"),
    ]);

  // Parse once; detection, metadata, exclusion and extraction share it.
  const document = parseDocument(rawHtml);

  const stage1 = detectNeedForBrowser(document, null, {
    raw: options.raw,
    stage: "stage1",
    verbose: options.verbose,
  });

  if (stage1.shouldFallback) {
    logVerbose(
      `Auto-detect: ${stage1.reason}, falling back to headless`,
      options
    );
    return fetchHeadless(url, options);
  }

  // Stage 2 judges the page itself, so it runs before --exclude is applied.
  let extracted = extractContent(document, {
    baseUrl: finalUrl,
    raw: options.raw,
  });

  const stage2 = detectNeedForBrowser(document, extracted.content, {
    raw: options.raw,
    stage: "stage2",
    verbose: options.verbose,
  });

  if (stage2.shouldFallback) {
    logVerbose(
      `Auto-detect: ${stage2.reason}, falling back to headless`,
      options
    );
    return fetchHeadless(url, options);
  }

  if (options.excludeSelectors?.length) {
    extracted = extractContent(document, {
      baseUrl: finalUrl,
      excludeSelectors: options.excludeSelectors,
      raw: options.raw,
    });
  }

  logVerbose("Auto-detect: content is sufficient, using static", options);
  return { extracted, finalUrl, html: rawHtml, strategy: "static" };
}

async function fetchWithMode(
  url: string,
  mode: RenderMode,
  options: FetchOptions
): Promise<FetchModeResult> {
  if (mode === "static") {
    const result = await fetchWithHttp(url, options);
    if (result.strategyUsed === "markdown") {
      return {
        finalUrl: result.finalUrl,
        html: "",
        markdown: result.markdown,
        markdownTokens: result.markdownTokens,
        strategy: "markdown",
      };
    }
    return { finalUrl: result.finalUrl, html: result.html, strategy: "static" };
  }

  if (mode === "headless") {
    return fetchHeadless(url, options);
  }

  return fetchWithAutoDetect(url, options);
}

async function htmlToMarkdownPipeline(
  result: FetchModeResult,
  options: FetchOptions
): Promise<{ markdown: string; metadata: CacheMetadata }> {
  const [{ convertHtmlToMarkdown }, { extractContent }] = await Promise.all([
    import("./converter"),
    import("./extractor"),
  ]);

  const extracted =
    result.extracted ??
    extractContent(result.html, {
      baseUrl: result.finalUrl,
      excludeSelectors: options.excludeSelectors,
      raw: options.raw,
    });
  const { author, description, title } = extracted.metadata;

  const markdown = convertHtmlToMarkdown(extracted.content, {
    baseUrl: result.finalUrl,
    stripLinks: options.stripLinks,
  });

  return { markdown, metadata: { author, description, title } };
}

async function orchestrateFetch(
  url: string,
  mode: RenderMode,
  options: FetchOptions
): Promise<FetchResult> {
  const cached = await tryGetFromCache(url, options);
  if (cached) {
    options.onStrategyResolved?.(cached.strategyUsed);
    return cached;
  }

  const result = await fetchWithMode(url, mode, options);
  options.onStrategyResolved?.(result.strategy);

  let markdown: string;
  let metadata: CacheMetadata = {};
  let markdownTokens: number | undefined;

  if (result.markdown) {
    // Server returned markdown directly (content negotiation)
    ({ markdown, markdownTokens } = result);
  } else {
    // Run extract→convert pipeline on HTML
    const converted = await htmlToMarkdownPipeline(result, options);
    ({ markdown, metadata } = converted);
  }

  if (!options.noCache) {
    await writeToCache(
      url,
      markdown,
      result.finalUrl,
      metadata,
      { enabled: !options.noCache, ...options.cache },
      extractionOptionsFrom(options)
    );
  }

  return {
    finalUrl: result.finalUrl,
    fromCache: false,
    markdown,
    markdownTokens,
    metadata,
    strategyUsed: result.strategy,
  };
}

export function fetchPage(
  url: string,
  options: FetchOptions
): Promise<FetchResult> {
  const mode = options.mode ?? "auto";
  return orchestrateFetch(url, mode, options);
}
