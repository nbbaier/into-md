import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface CacheOptions {
  enabled: boolean;
  ttlMs: number;
  cacheDir?: string;
}

/** Options that affect markdown output and should be part of the cache key */
export interface ExtractionOptions {
  raw?: boolean;
  excludeSelectors?: string[];
  stripLinks?: boolean;
  encoding?: string;
}

export interface CacheMetadata {
  title?: string;
  description?: string;
  author?: string;
}

interface CachedResponse {
  url: string;
  finalUrl: string;
  fetchedAt: number;
  markdown: string;
  metadata: CacheMetadata;
  cacheVersion: 2;
}

const defaultCacheDir = join(
  process.env.HOME ?? process.cwd(),
  ".cache",
  "into-md"
);

const DEFAULT_TTL_MS = 60 * 60 * 1000;

export const buildCachePath = (
  url: string,
  cacheDir = defaultCacheDir,
  extraction?: ExtractionOptions
): string => {
  const hasher = createHash("sha256").update(url);

  if (extraction) {
    const parts: string[] = [];
    if (extraction.raw) {
      parts.push("raw=true");
    }
    if (extraction.excludeSelectors?.length) {
      const sorted = [...extraction.excludeSelectors].sort();
      parts.push(`exclude=${sorted.join(",")}`);
    }
    if (extraction.stripLinks) {
      parts.push("stripLinks=true");
    }
    if (extraction.encoding) {
      parts.push(`encoding=${extraction.encoding}`);
    }
    if (parts.length > 0) {
      hasher.update(`\n${parts.join("\n")}`);
    }
  }

  const hash = hasher.digest("hex");
  return join(cacheDir, `${hash}.json`);
};

export async function readFromCache(
  url: string,
  options?: Partial<CacheOptions>,
  extraction?: ExtractionOptions
): Promise<CachedResponse | null> {
  const {
    enabled = true,
    ttlMs = DEFAULT_TTL_MS,
    cacheDir = defaultCacheDir,
  } = options ?? {};

  if (!enabled) {
    return null;
  }

  const target = buildCachePath(url, cacheDir, extraction);
  try {
    const [file, info] = await Promise.all([
      readFile(target, "utf8"),
      stat(target),
    ]);
    const payload = JSON.parse(file) as Record<string, unknown>;

    // Reject old-format cache entries (v1 had content+strategy, no cacheVersion)
    if (payload.cacheVersion !== 2) {
      return null;
    }

    const isFresh = info.mtimeMs + ttlMs > Date.now();
    if (!isFresh) {
      return null;
    }
    if (payload.url !== url) {
      return null;
    }
    return payload as unknown as CachedResponse;
  } catch {
    return null;
  }
}

export async function writeToCache(
  url: string,
  markdown: string,
  finalUrl: string,
  metadata: CacheMetadata,
  options?: Partial<CacheOptions>,
  extraction?: ExtractionOptions
): Promise<void> {
  const { enabled = true, cacheDir = defaultCacheDir } = options ?? {};

  if (!enabled) {
    return;
  }

  const target = buildCachePath(url, cacheDir, extraction);
  await mkdir(dirname(target), { recursive: true });
  const payload: CachedResponse = {
    url,
    finalUrl,
    markdown,
    metadata,
    fetchedAt: Date.now(),
    cacheVersion: 2,
  };
  await writeFile(target, JSON.stringify(payload, null, 2), "utf8");
}
