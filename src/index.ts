import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import pkg from "../package.json" with { type: "json" };
import { fetchPage } from "./fetcher";
import { buildFrontmatter } from "./metadata";

const DEFAULT_TIMEOUT = 30_000;
const { version } = pkg;

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

  let mode: "auto" | "static" | "headless";
  if (options.js === true) {
    mode = "headless";
  } else if (options.js === false) {
    mode = "static";
  } else {
    mode = "auto";
  }

  let strategyLabel = "";
  let frontmatterStrategy = "";
  const verboseBuffer: string[] = options.verbose ? ["Starting into-md…"] : [];
  let fetched = false;
  const strategyResolver = (
    strategyUsed: "static" | "headless" | "markdown"
  ) => {
    if (fetched) {
      return;
    }
    fetched = true;
    if (mode === "auto") {
      strategyLabel = `auto > ${strategyUsed}`;
      frontmatterStrategy = `auto>${strategyUsed}`;
    } else {
      strategyLabel = strategyUsed;
      frontmatterStrategy = strategyUsed;
    }
    console.error(`Strategy: ${strategyLabel}`);
    if (options.verbose && verboseBuffer.length > 0) {
      for (const line of verboseBuffer) {
        console.error(line);
      }
      verboseBuffer.length = 0;
    }
  };
  const fetchResult = await fetchPage(url, {
    cookiesPath: options.cookies,
    encoding: options.encoding,
    noCache: options.noCache,
    timeoutMs: options.timeout ?? DEFAULT_TIMEOUT,
    mode,
    raw: options.raw,
    excludeSelectors: selectors,
    stripLinks: options.stripLinks,
    userAgent: options.userAgent,
    verbose: options.verbose,
    logBuffer: options.verbose ? verboseBuffer : undefined,
    onStrategyResolved: strategyResolver,
  });
  strategyResolver(fetchResult.strategyUsed);

  if (options.verbose && fetchResult.markdownTokens) {
    console.error(
      `Markdown tokens (from server): ${fetchResult.markdownTokens}`
    );
  }

  const frontmatter = buildFrontmatter({
    ...fetchResult.metadata,
    source: fetchResult.finalUrl,
    strategy: frontmatterStrategy,
  });

  const output = `${frontmatter}\n\n${fetchResult.markdown}`.trim();

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

  program.version(version);
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

  let normalizedUrl = url;
  if (!(url.startsWith("http://") || url.startsWith("https://"))) {
    normalizedUrl = `https://${url}`;
  }

  const opts = program.opts<CliOptions>();
  try {
    await run(normalizedUrl, {
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
