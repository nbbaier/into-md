// Per-stage timing of the into-md TS pipeline (auto mode, static path) on local fixtures.
// Usage: bun run bench-ts.ts [iterations]
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { detectNeedForBrowser } from "../../src/auto-detect";
import { convertHtmlToMarkdown } from "../../src/converter";
import { extractContent } from "../../src/extractor";

const ITERATIONS = Number(process.argv[2] ?? 20);
const dir = join(import.meta.dir, "fixtures");
const BASE = "https://example.com/page";

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

const runOnce = (html: string) => {
  const t0 = performance.now();
  detectNeedForBrowser(html, null, { stage: "stage1" });
  const t1 = performance.now();
  const extracted = extractContent(html, { baseUrl: BASE });
  const t2 = performance.now();
  detectNeedForBrowser(html, extracted.html, { stage: "stage2" });
  const t3 = performance.now();
  const md = convertHtmlToMarkdown(extracted.html, { baseUrl: BASE });
  const t4 = performance.now();
  return {
    convert: t4 - t3,
    extract: t2 - t1,
    md,
    stage1: t1 - t0,
    stage2: t3 - t2,
    total: t4 - t0,
  };
};

const rows: Record<string, unknown>[] = [];
for (const file of readdirSync(dir)
  .filter((f) => f.endsWith(".html"))
  .sort()) {
  const html = readFileSync(join(dir, file), "utf8");
  const cold = runOnce(html);
  const samples = Array.from({ length: ITERATIONS }, () => runOnce(html));
  const pick = (k: "stage1" | "extract" | "stage2" | "convert" | "total") =>
    Number(median(samples.map((s) => s[k])).toFixed(1));
  rows.push({
    convert: pick("convert"),
    extract: pick("extract"),
    firstRunMs: Number(cold.total.toFixed(1)),
    fixture: file.replace(".html", ""),
    kb: Math.round(html.length / 1024),
    mdKb: Math.round(cold.md.length / 1024),
    stage1: pick("stage1"),
    stage2: pick("stage2"),
    totalMs: pick("total"),
  });
}
console.table(rows);
console.log(JSON.stringify(rows));
