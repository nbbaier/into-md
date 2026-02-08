import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readFromCache, writeToCache } from "./cache";

const testCacheDir = join(process.cwd(), ".test-cache-into-md");

describe("cache backward compatibility", () => {
  beforeEach(async () => {
    await mkdir(testCacheDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testCacheDir, { recursive: true, force: true });
  });

  it("handles old cache entries without strategy", async () => {
    const url = "https://example.com/old-entry";
    const oldEntry = {
      url,
      fetchedAt: Date.now(),
      content: "<html><body>Old content</body></html>",
    };

    const hash = (await import("node:crypto"))
      .createHash("sha256")
      .update(url)
      .digest("hex");
    const cachePath = join(testCacheDir, `${hash}.json`);
    await writeFile(cachePath, JSON.stringify(oldEntry, null, 2), "utf8");

    const cached = await readFromCache(url, { cacheDir: testCacheDir });
    expect(cached).not.toBeNull();
    expect(cached?.strategy).toBe("unknown");
    expect(cached?.finalUrl).toBe(url);
  });

  it("handles new format cache entries", async () => {
    const url = "https://example.com/new-entry";
    await writeToCache(
      url,
      "<html><body>New content</body></html>",
      "https://example.com/new-entry",
      "static",
      { cacheDir: testCacheDir }
    );

    const cached = await readFromCache(url, { cacheDir: testCacheDir });
    expect(cached).not.toBeNull();
    expect(cached?.strategy).toBe("static");
    expect(cached?.finalUrl).toBe("https://example.com/new-entry");
  });

  it("handles redirected URLs in new format", async () => {
    const url = "https://example.com/redirect";
    const finalUrl = "https://example.com/target";
    await writeToCache(
      url,
      "<html><body>Redirected content</body></html>",
      finalUrl,
      "headless",
      { cacheDir: testCacheDir }
    );

    const cached = await readFromCache(url, { cacheDir: testCacheDir });
    expect(cached).not.toBeNull();
    expect(cached?.finalUrl).toBe(finalUrl);
    expect(cached?.strategy).toBe("headless");
  });
});
