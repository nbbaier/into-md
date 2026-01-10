import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface CacheOptions {
  enabled: boolean;
  ttlMs: number;
  cacheDir?: string;
}

export interface CachedResponse {
  url: string;
  fetchedAt: number;
  content: string;
}

const defaultCacheDir = join(
  process.env.HOME ?? process.cwd(),
  ".cache",
  "into-md"
);

const defaultTtlMs = 60 * 60 * 1000;

function resolveCacheDir(cacheDir?: string): string {
  return cacheDir ?? defaultCacheDir;
}

function buildCachePath(url: string, cacheDir = defaultCacheDir): string {
  const hash = createHash("sha256").update(url).digest("hex");
  return join(cacheDir, `${hash}.json`);
}

export async function readFromCache(
  url: string,
  options?: Partial<CacheOptions>
): Promise<CachedResponse | null> {
  const { enabled = true, ttlMs = defaultTtlMs, cacheDir } = options ?? {};
  if (!enabled) {
    return null;
  }

  const target = buildCachePath(url, resolveCacheDir(cacheDir));
  try {
    const [file, info] = await Promise.all([
      readFile(target, "utf8"),
      stat(target),
    ]);
    const payload = JSON.parse(file) as CachedResponse;
    const isFresh = info.mtimeMs + ttlMs > Date.now();
    if (!isFresh) {
      return null;
    }
    if (payload.url !== url) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function writeToCache(
  url: string,
  content: string,
  options?: Partial<CacheOptions>
): Promise<void> {
  const { enabled = true, cacheDir } = options ?? {};
  if (!enabled) {
    return;
  }
  const target = buildCachePath(url, resolveCacheDir(cacheDir));
  await mkdir(dirname(target), { recursive: true });
  const payload: CachedResponse = { content, fetchedAt: Date.now(), url };
  await writeFile(target, JSON.stringify(payload, null, 2), "utf8");
}
