import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { CacheEntry } from "./cache";
import { writeToCache } from "./cache";
import { fetchPage } from "./fetcher";

const testCacheDir = join(process.cwd(), ".test-cache-fetcher");
const url = "https://example.com/article";
const cache = { cacheDir: testCacheDir };

const liveHtml = `<html><head><title>Live</title></head><body><article><h1>Live</h1>${"<p>Freshly fetched paragraph with enough text to extract.</p>".repeat(10)}</article></body></html>`;

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
