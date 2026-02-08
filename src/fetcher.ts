import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { detectNeedForBrowser } from "./auto-detect";
import { type CacheOptions, readFromCache, writeToCache } from "./cache";

export type RenderMode = "auto" | "static" | "headless";

export interface FetchOptions {
  mode?: RenderMode;
  cookiesPath?: string;
  userAgent?: string;
  encoding?: string;
  timeoutMs?: number;
  cache?: Partial<CacheOptions>;
  noCache?: boolean;
  verbose?: boolean;
  raw?: boolean;
  onStrategyResolved?: (strategy: "static" | "headless") => void;
  logBuffer?: string[];
}

export interface FetchResult {
  html: string;
  finalUrl: string;
  fromCache: boolean;
  strategyUsed: "static" | "headless";
}

interface CookieRecord {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  expires: number;
}

interface InternalFetchResult extends FetchResult {
  contentType?: string;
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

  const domain = parts[0];
  const path = parts[2];
  const secureFlag = parts[3];
  const expires = parts[4];
  const name = parts[5];
  const value = parts[6];
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

function parseCookiesFile(cookiesPath?: string): {
  header: string | undefined;
  playwrightCookies: CookieRecord[];
} {
  if (!cookiesPath) {
    return { header: undefined, playwrightCookies: [] };
  }
  let content: string;
  try {
    content = readFileSync(cookiesPath, "utf8");
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

  const { header: cookiesHeader } = parseCookiesFile(options.cookiesPath);
  const headers = new Headers({
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
    const html = decoder.decode(buffer);
    return {
      contentType,
      finalUrl,
      fromCache: false,
      html,
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
): Promise<FetchResult> {
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

  const { playwrightCookies } = parseCookiesFile(options.cookiesPath);
  const browser = await playwright.chromium.launch({ headless: true });
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
    await page.waitForLoadState("networkidle", { timeout: networkidleTimeout });
  } catch {
    // Ignore timeout - networkidle may not be reached, continue with page content
  }

  const html = await page.content();
  const finalUrl = page.url();

  await browser.close();
  return { finalUrl, fromCache: false, html, strategyUsed: "headless" };
}

async function ensureBrowserInstalled(_verbose?: boolean): Promise<void> {
  let pw: typeof import("playwright");
  try {
    pw = await import("playwright");
  } catch {
    throw new Error("JS mode requested but playwright is not installed");
  }

  try {
    const browser = await pw.chromium.launch({ headless: true });
    await browser.close();
  } catch {
    if (process.stdin.isTTY && !process.env.CI) {
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

      if (answer.toLowerCase() === "y") {
        console.error("Installing chromium...");
        const { $ } = await import("bun");
        await $`bunx playwright install chromium`;
        return;
      }

      throw new Error(
        "Browser binaries not found. Run `bunx playwright install chromium`"
      );
    }

    throw new Error(
      "Browser binaries not found. Run `bunx playwright install chromium`"
    );
  }
}

async function tryGetFromCache(
  url: string,
  mode: RenderMode,
  options: FetchOptions
): Promise<FetchResult | null> {
  if (options.noCache) {
    return null;
  }

  const cached = await readFromCache(url, {
    enabled: !options.noCache,
    ...options.cache,
  });
  if (!cached) {
    return null;
  }

  const rawCachedStrategy = cached.strategy as
    | "static"
    | "headless"
    | "unknown";

  if (rawCachedStrategy === "unknown") {
    logVerbose("Cache miss (unknown strategy, re-probing)", options);
    return null;
  }

  const canUseCache =
    mode === "auto" ||
    (mode === "static" && rawCachedStrategy === "static") ||
    (mode === "headless" && rawCachedStrategy === "headless");

  if (canUseCache) {
    logVerbose("Cache hit", options);
    return {
      html: cached.content,
      finalUrl: cached.finalUrl ?? url,
      fromCache: true,
      strategyUsed: rawCachedStrategy,
    };
  }

  logVerbose("Cache miss (strategy mismatch)", options);
  return null;
}

const HTML_CONTENT_TYPE_RE = /text\/html|application\/xhtml\+xml/i;

async function fetchWithAutoDetect(
  url: string,
  options: FetchOptions
): Promise<{
  html: string;
  finalUrl: string;
  strategy: "static" | "headless";
}> {
  logVerbose("Auto-detect mode: starting static probe", options);

  const staticResult = await fetchWithHttp(url, options);
  const rawHtml = staticResult.html;
  const finalUrl = staticResult.finalUrl;

  if (
    staticResult.contentType &&
    !HTML_CONTENT_TYPE_RE.test(staticResult.contentType)
  ) {
    logVerbose("Auto-detect: non-HTML content type, using static", options);
    return { html: rawHtml, finalUrl, strategy: "static" };
  }

  const stage1 = detectNeedForBrowser(rawHtml, null, {
    verbose: options.verbose,
    raw: options.raw,
    stage: "stage1",
  });

  if (stage1.shouldFallback) {
    logVerbose(
      `Auto-detect: ${stage1.reason}, falling back to headless`,
      options
    );
    await ensureBrowserInstalled(options.verbose);
    const browserResult = await fetchWithBrowser(url, options);
    return {
      html: browserResult.html,
      finalUrl: browserResult.finalUrl,
      strategy: "headless",
    };
  }

  const { extractContent } = await import("./extractor");
  const extracted = extractContent(rawHtml, {
    baseUrl: finalUrl,
    raw: options.raw,
  });
  const extractedHtml = extracted.html;

  const stage2 = detectNeedForBrowser(rawHtml, extractedHtml, {
    verbose: options.verbose,
    raw: options.raw,
    stage: "stage2",
  });

  if (stage2.shouldFallback) {
    logVerbose(
      `Auto-detect: ${stage2.reason}, falling back to headless`,
      options
    );
    await ensureBrowserInstalled(options.verbose);
    const browserResult = await fetchWithBrowser(url, options);
    return {
      html: browserResult.html,
      finalUrl: browserResult.finalUrl,
      strategy: "headless",
    };
  }

  logVerbose("Auto-detect: content is sufficient, using static", options);
  return { html: rawHtml, finalUrl, strategy: "static" };
}

async function fetchWithMode(
  url: string,
  mode: RenderMode,
  options: FetchOptions
): Promise<{
  html: string;
  finalUrl: string;
  strategy: "static" | "headless";
}> {
  if (mode === "static") {
    const result = await fetchWithHttp(url, options);
    return { html: result.html, finalUrl: result.finalUrl, strategy: "static" };
  }

  if (mode === "headless") {
    await ensureBrowserInstalled(options.verbose);
    const result = await fetchWithBrowser(url, options);
    return {
      html: result.html,
      finalUrl: result.finalUrl,
      strategy: "headless",
    };
  }

  return fetchWithAutoDetect(url, options);
}

export async function orchestrateFetch(
  url: string,
  mode: RenderMode,
  options: FetchOptions
): Promise<FetchResult> {
  const cached = await tryGetFromCache(url, mode, options);
  if (cached) {
    options.onStrategyResolved?.(cached.strategyUsed);
    return cached;
  }

  const { html, finalUrl, strategy } = await fetchWithMode(url, mode, options);
  options.onStrategyResolved?.(strategy);

  if (!options.noCache) {
    await writeToCache(url, html, finalUrl, strategy, {
      enabled: !options.noCache,
      ...options.cache,
    });
  }

  return { html, finalUrl, fromCache: false, strategyUsed: strategy };
}

export function fetchPage(
  url: string,
  options: FetchOptions
): Promise<FetchResult> {
  const mode = options.mode ?? "auto";
  return orchestrateFetch(url, mode, options);
}
