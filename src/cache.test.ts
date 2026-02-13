import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildCachePath, readFromCache, writeToCache } from "./cache";

const testCacheDir = join(process.cwd(), ".test-cache-into-md");

describe("cache key with extraction options", () => {
  it("produces same key for no options and empty options", () => {
    const url = "https://example.com/page";
    const a = buildCachePath(url, testCacheDir);
    const b = buildCachePath(url, testCacheDir, {});
    expect(a).toBe(b);
  });

  it("produces different keys for different raw option", () => {
    const url = "https://example.com/page";
    const noOpts = buildCachePath(url, testCacheDir);
    const withRaw = buildCachePath(url, testCacheDir, { raw: true });
    expect(noOpts).not.toBe(withRaw);
  });

  it("produces different keys for different stripLinks option", () => {
    const url = "https://example.com/page";
    const noOpts = buildCachePath(url, testCacheDir);
    const withStrip = buildCachePath(url, testCacheDir, { stripLinks: true });
    expect(noOpts).not.toBe(withStrip);
  });

  it("produces different keys for different excludeSelectors", () => {
    const url = "https://example.com/page";
    const noOpts = buildCachePath(url, testCacheDir);
    const withExclude = buildCachePath(url, testCacheDir, {
      excludeSelectors: ["nav", "footer"],
    });
    expect(noOpts).not.toBe(withExclude);
  });

  it("produces same key regardless of excludeSelectors order", () => {
    const url = "https://example.com/page";
    const a = buildCachePath(url, testCacheDir, {
      excludeSelectors: ["nav", "footer"],
    });
    const b = buildCachePath(url, testCacheDir, {
      excludeSelectors: ["footer", "nav"],
    });
    expect(a).toBe(b);
  });

  it("produces different keys for different encoding", () => {
    const url = "https://example.com/page";
    const noOpts = buildCachePath(url, testCacheDir);
    const withEncoding = buildCachePath(url, testCacheDir, {
      encoding: "shift-jis",
    });
    expect(noOpts).not.toBe(withEncoding);
  });

  it("cache read/write with extraction options round-trips", async () => {
    await mkdir(testCacheDir, { recursive: true });
    try {
      const url = "https://example.com/options-test";
      const extraction = { raw: true, stripLinks: true };

      await writeToCache(
        url,
        "# Raw stripped",
        url,
        { title: "Test" },
        { cacheDir: testCacheDir },
        extraction
      );

      // Same options → hit
      const hit = await readFromCache(
        url,
        { cacheDir: testCacheDir },
        extraction
      );
      expect(hit).not.toBeNull();
      expect(hit?.markdown).toBe("# Raw stripped");

      // No options → miss
      const miss = await readFromCache(url, { cacheDir: testCacheDir });
      expect(miss).toBeNull();
    } finally {
      await rm(testCacheDir, { recursive: true, force: true });
    }
  });
});

describe("cache backward compatibility", () => {
  beforeEach(async () => {
    await mkdir(testCacheDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testCacheDir, { recursive: true, force: true });
  });

  it("rejects old cache entries without cacheVersion as cache miss", async () => {
    const url = "https://example.com/old-entry";
    const oldEntry = {
      url,
      fetchedAt: Date.now(),
      content: "<html><body>Old content</body></html>",
      strategy: "static",
    };

    const hash = (await import("node:crypto"))
      .createHash("sha256")
      .update(url)
      .digest("hex");
    const cachePath = join(testCacheDir, `${hash}.json`);
    await writeFile(cachePath, JSON.stringify(oldEntry, null, 2), "utf8");

    const cached = await readFromCache(url, { cacheDir: testCacheDir });
    expect(cached).toBeNull();
  });

  it("reads new v2 format cache entries", async () => {
    const url = "https://example.com/new-entry";
    await writeToCache(
      url,
      "# Hello World\n\nSome markdown content",
      "https://example.com/new-entry",
      { title: "Hello World" },
      { cacheDir: testCacheDir }
    );

    const cached = await readFromCache(url, { cacheDir: testCacheDir });
    expect(cached).not.toBeNull();
    expect(cached?.markdown).toBe("# Hello World\n\nSome markdown content");
    expect(cached?.metadata.title).toBe("Hello World");
    expect(cached?.finalUrl).toBe("https://example.com/new-entry");
  });

  it("stores metadata in cache entries", async () => {
    const url = "https://example.com/with-meta";
    const finalUrl = "https://example.com/with-meta";
    await writeToCache(
      url,
      "# Test",
      finalUrl,
      { title: "Test Title", description: "A description", author: "Author" },
      { cacheDir: testCacheDir }
    );

    const cached = await readFromCache(url, { cacheDir: testCacheDir });
    expect(cached).not.toBeNull();
    expect(cached?.metadata.title).toBe("Test Title");
    expect(cached?.metadata.description).toBe("A description");
    expect(cached?.metadata.author).toBe("Author");
  });

  it("handles redirected URLs in new format", async () => {
    const url = "https://example.com/redirect";
    const finalUrl = "https://example.com/target";
    await writeToCache(
      url,
      "# Redirected content",
      finalUrl,
      {},
      { cacheDir: testCacheDir }
    );

    const cached = await readFromCache(url, { cacheDir: testCacheDir });
    expect(cached).not.toBeNull();
    expect(cached?.finalUrl).toBe(finalUrl);
  });
});
