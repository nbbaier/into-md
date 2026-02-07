import { writeFile } from "node:fs/promises";
import { Command } from "commander";

import { convertHtmlToMarkdown } from "./converter";
import { extractContent } from "./extractor";
import { fetchPage } from "./fetcher";
import { annotateImages } from "./images";
import { buildFrontmatter } from "./metadata";
import { convertTablesToJson } from "./tables";

const DEFAULT_TIMEOUT = 30_000;

interface CliOptions {
  output?: string;
  js?: boolean;

  raw?: boolean;
  cookies?: string;
  userAgent?: string;
  encoding?: string;
  stripLinks?: boolean;
  exclude?: string;
  timeout?: number;
  noCache?: boolean;
  verbose?: boolean;
}

async function run(url: string, options: CliOptions) {
  const selectors =
    options.exclude
      ?.split(",")
      .map((selector) => selector.trim())
      .filter(Boolean) ?? [];

  if (options.verbose) {
    console.error("Starting into-md…");
  }

  let mode: "auto" | "static" | "headless";
  if (options.js === true) {
    mode = "headless";
  } else if (options.js === false) {
    mode = "static";
  } else {
    mode = "auto";
  }

  const fetchResult = await fetchPage(url, {
    cookiesPath: options.cookies,
    encoding: options.encoding,
    noCache: options.noCache,
    timeoutMs: options.timeout ?? DEFAULT_TIMEOUT,
    mode,
    raw: options.raw,
    userAgent: options.userAgent,
    verbose: options.verbose,
  });

  let strategyLabel: string;
  if (mode === "auto") {
    strategyLabel = `auto > ${fetchResult.strategyUsed}`;
  } else {
    strategyLabel = fetchResult.strategyUsed;
  }
  console.error(`Strategy: ${strategyLabel}`);

  const extracted = extractContent(fetchResult.html, {
    baseUrl: fetchResult.finalUrl,
    excludeSelectors: selectors,
    raw: options.raw,
  });

  let workingHtml = extracted.html;
  workingHtml = convertTablesToJson(workingHtml);
  workingHtml = annotateImages(workingHtml, fetchResult.finalUrl);

  const markdown = convertHtmlToMarkdown(workingHtml, {
    baseUrl: fetchResult.finalUrl,
    stripLinks: options.stripLinks,
  });

  const frontmatter = buildFrontmatter({
    ...extracted.metadata,
    source: fetchResult.finalUrl,
    strategy: strategyLabel,
  });

  const output = `${frontmatter}\n\n${markdown}`.trim();

  if (options.output) {
    await writeFile(options.output, output, "utf8");
    if (options.verbose) {
      console.error(`Saved to ${options.output}`);
    }
  } else {
    console.log(output);
  }

  const size = Buffer.byteLength(output, "utf8");
  if (size > 100_000) {
    console.error(
      `Warning: Output is ${Math.round(size / 1024)}KB. Large documents may exceed LLM context limits.`
    );
  }
}

function buildProgram() {
  const program = new Command()
    .name("into-md")
    .description("Fetch a web page and convert its content to markdown.")
    .argument("<url>", "URL to fetch")
    .option("-o, --output <file>", "Write output to file instead of stdout")
    .option("--js", "Force headless browser rendering")
    .option("--no-js", "Force static HTTP fetch (no browser)")
    .option("--raw", "Skip content extraction, convert entire HTML")
    .option(
      "--cookies <file>",
      "Path to cookies file for authenticated requests"
    )
    .option("--user-agent <string>", "Custom User-Agent header")
    .option(
      "--encoding <encoding>",
      "Force character encoding (auto-detected by default)"
    )
    .option("--strip-links", "Remove hyperlinks, keep only anchor text")
    .option(
      "--exclude <selectors>",
      "CSS selectors to exclude (comma-separated)"
    )
    .option(
      "--timeout <ms>",
      "Request timeout in milliseconds",
      `${DEFAULT_TIMEOUT}`
    )
    .option("--no-cache", "Bypass response cache")
    .option("-v, --verbose", "Show detailed progress information");

  program.version("0.1.0");
  return program;
}

async function main() {
  const program = buildProgram();
  program.parse(process.argv);

  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes("--js") && rawArgs.includes("--no-js")) {
    console.error("Cannot use --js and --no-js together");
    process.exitCode = 1;
    return;
  }

  const [url] = program.args;
  if (!url) {
    program.help();
    return;
  }

  const opts = program.opts<CliOptions>();
  try {
    await run(url, {
      ...opts,
      timeout: opts.timeout ? Number(opts.timeout) : DEFAULT_TIMEOUT,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

main();
