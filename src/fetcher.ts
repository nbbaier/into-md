import { basename } from "node:path";

import  { type CacheOptions } from "./cache";

import { readFromCache, writeToCache } from "./cache";

export interface FetchOptions {
  useJs?: boolean;
  cookiesPath?: string;
  userAgent?: string;
  encoding?: string;
  timeoutMs?: number;
  cache?: Partial<CacheOptions>;
  noCache?: boolean;
  verbose?: boolean;
}

export interface FetchResult {
  html: string;
  finalUrl: string;
  fromCache: boolean;
}

interface CookieRecord {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  expires: number;
}

const defaultUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0 Safari/537.36";

function logVerbose(message: string, verbose?: boolean) {
  if (verbose) {
    console.error(message);
  }
}

function parseCookiesFile(cookiesPath?: string): {
  header: string | undefined;
  playwrightCookies: CookieRecord[];
} {
  if (!cookiesPath) {return { header: undefined, playwrightCookies: [] };}
  let content: string;
  try {
    content = Bun.readFileSync(cookiesPath, "utf8");
  } catch (error) {
    throw new Error(
      `Unable to read cookies file "${basename(cookiesPath)}": ${String(error)}`, { cause: error }
    );
  }

  const entries: CookieRecord[] = [];
  const headerPairs: string[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {continue;}
    const parts = trimmed.split("\t");
    if (parts.length < 7) {continue;}
    const [domain, , path, secureFlag, expires, name, value] = parts;
    entries.push({
      domain,
      expires: Number(expires),
      name,
      path,
      secure: secureFlag.toLowerCase() === "true",
      value,
    });
    headerPairs.push(`${name}=${value}`);
  }

  return {
    header: headerPairs.length ? headerPairs.join("; ") : undefined,
    playwrightCookies: entries,
  };
}

async function fetchWithHttp(
  url: string,
  options: FetchOptions
): Promise<FetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 30_000
  );

  const { header: cookiesHeader } = parseCookiesFile(options.cookiesPath);
  const headers = new Headers({
    "User-Agent": options.userAgent ?? defaultUserAgent,
  });
  if (cookiesHeader) {headers.set("Cookie", cookiesHeader);}

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
    const buffer = await response.arrayBuffer();
    const encoding = options.encoding ?? undefined;
    const decoder =
      encoding != null ? new TextDecoder(encoding) : new TextDecoder();
    const html = decoder.decode(buffer);
    return { finalUrl, fromCache: false, html };
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
      )})`, { cause: error }
    );
  }

  const { playwrightCookies } = parseCookiesFile(options.cookiesPath);
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: options.userAgent ?? defaultUserAgent,
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
    timeout: options.timeoutMs ?? 30_000,
    waitUntil: "networkidle",
  });

  const html = await page.content();
  const finalUrl = page.url();

  await browser.close();
  return { finalUrl, fromCache: false, html };
}

export async function fetchPage(
  url: string,
  options: FetchOptions
): Promise<FetchResult> {
  const cacheEnabled = !options.noCache;
  if (cacheEnabled) {
    const cached = await readFromCache(url, {
      enabled: cacheEnabled,
      ...options.cache,
    });
    if (cached) {
      logVerbose("Cache hit", options.verbose);
      return { finalUrl: url, fromCache: true, html: cached.content };
    }
  }

  logVerbose(
    `Fetching ${url} ${options.useJs ? "(headless browser)" : "(http)"}`,
    options.verbose
  );
  const result = options.useJs
    ? await fetchWithBrowser(url, options)
    : await fetchWithHttp(url, options);

  if (cacheEnabled) {
    await writeToCache(url, result.html, {
      enabled: cacheEnabled,
      ...options.cache,
    });
  }

  return result;
}
