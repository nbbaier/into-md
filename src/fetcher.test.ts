import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { CacheEntry } from "./cache";
import { writeToCache } from "./cache";
import { fetchPage } from "./fetcher";

const testCacheDir = join(process.cwd(), ".test-cache-fetcher");
const url = "https://example.com/article";
const cache = { cacheDir: testCacheDir };

const liveHtml = `<html><head><title>Live</title></head><body><article><h1>Live</h1>${"<p>Freshly fetched paragraph with enough text to extract.</p>".repeat(10)}</article></body></html>`;

const renderedHtml = `<html><head><title>Rendered</title></head><body><article><h1>Rendered</h1>${"<p>Paragraph rendered by the stubbed browser with enough text.</p>".repeat(10)}</article></body></html>`;

/** Stands in for `playwright`, which fetcher.ts loads lazily, so no Chromium launches */
const stubPlaywright = () => {
  const visited: string[] = [];
  const page = {
    content: () => Promise.resolve(renderedHtml),
    goto: (target: string) => {
      visited.push(target);
      return Promise.resolve(null);
    },
    url: () => url,
    waitForLoadState: () => Promise.resolve(),
  };
  const browser = {
    close: () => Promise.resolve(),
    newContext: () =>
      Promise.resolve({
        addCookies: () => Promise.resolve(),
        newPage: () => Promise.resolve(page),
      }),
  };
  mock.module("playwright", () => ({
    chromium: { launch: () => Promise.resolve(browser) },
  }));
  return visited;
};

const seedCache = (strategy: CacheEntry["strategy"]): Promise<void> =>
  writeToCache(
    url,
    { finalUrl: url, markdown: "# Cached", metadata: {}, strategy },
    cache
  );

describe("cache reuse under forced modes", () => {
  let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">>;

  beforeEach(() => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(liveHtml, { headers: { "content-type": "text/html" } })
    );
  });

  afterEach(async () => {
    fetchSpy.mockRestore();
    await rm(testCacheDir, { force: true, recursive: true });
  });

  it("--no-js re-fetches when the cached result came from a browser", async () => {
    await seedCache("headless");

    const result = await fetchPage(url, { cache, mode: "static" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.fromCache).toBe(false);
    expect(result.strategyUsed).toBe("static");
    expect(result.markdown).toContain("Freshly fetched");
  });

  it.each(["static", "markdown"] as const)(
    "--no-js reuses a cached %s result",
    async (strategy) => {
      await seedCache(strategy);

      const result = await fetchPage(url, { cache, mode: "static" });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.fromCache).toBe(true);
      expect(result.strategyUsed).toBe(strategy);
    }
  );

  it("--js re-fetches with the browser when the cached result was static", async () => {
    const visited = stubPlaywright();
    await seedCache("static");

    const result = await fetchPage(url, { cache, mode: "headless" });

    expect(visited).toEqual([url]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.fromCache).toBe(false);
    expect(result.strategyUsed).toBe("headless");
    expect(result.markdown).toContain("rendered by the stubbed browser");
  });

  it("--js reuses a cached browser result", async () => {
    await seedCache("headless");

    const result = await fetchPage(url, { cache, mode: "headless" });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.fromCache).toBe(true);
    expect(result.strategyUsed).toBe("headless");
  });

  it("auto mode reuses any cached strategy", async () => {
    await seedCache("headless");

    const result = await fetchPage(url, { cache, mode: "auto" });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.fromCache).toBe(true);
    expect(result.strategyUsed).toBe("headless");
  });
});
