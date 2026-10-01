// Writes TS pipeline markdown for a fixture to stdout (for parity checks).
import { readFileSync } from "node:fs";
import { convertHtmlToMarkdown } from "../../src/converter";
import { extractContent } from "../../src/extractor";

const BASE = "https://example.com/page";
const html = readFileSync(process.argv[2] ?? "", "utf8");
const { html: content } = extractContent(html, { baseUrl: BASE });
console.log(convertHtmlToMarkdown(content, { baseUrl: BASE }));
