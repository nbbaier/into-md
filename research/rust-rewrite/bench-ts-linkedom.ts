// Experiment: same pipeline in TS, but linkedom instead of JSDOM and fewer re-parses.
// Requires `bun add --no-save linkedom` (not a project dependency).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { convertHtmlToMarkdown } from "../../src/converter";

const ITERATIONS = Number(process.argv[2] ?? 20);
const dir = join(import.meta.dir, "fixtures");
const BASE = "https://example.com/page";
const SPA_ROOT_IDS = ["root", "app", "__next", "__nuxt", "__svelte"];

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
};

const runOnce = (html: string) => {
  const t0 = performance.now();
  const { document } = parseHTML(html);
  for (const id of SPA_ROOT_IDS) {
    document.getElementById(id)?.textContent?.trim();
  }
  for (const n of document.querySelectorAll("noscript")) {
    n.textContent?.toLowerCase().includes("javascript");
  }
  const t1 = performance.now();
  const title = document.querySelector("title")?.textContent;
  const desc = document
    .querySelector('meta[name="description"]')
    ?.getAttribute("content");
  const article = new Readability(
    parseHTML(html).document as unknown as Document
  ).parse();
  const content = article?.content ?? "";
  const t2 = performance.now();
  const sparse = (article?.textContent?.trim().length ?? 0) < 200;
  const t3 = performance.now();
  const md = convertHtmlToMarkdown(content, { baseUrl: BASE });
  const t4 = performance.now();
  return {
    convert: t4 - t3,
    extract: t2 - t1,
    md: md + String(title) + String(desc) + String(sparse),
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
    mdKb: Math.round(cold.md.length / 1024),
    stage1: pick("stage1"),
    stage2: pick("stage2"),
    totalMs: pick("total"),
  });
}
console.log(JSON.stringify(rows));
