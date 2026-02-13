import { describe, expect, it } from "bun:test";

import { convertHtmlToMarkdown } from "../converter";
import { extractContent } from "../extractor";
import { annotateImages } from "../images";
import { convertTablesToJson } from "../tables";

const BASE_URL = "https://example.com";

function runPipeline(
  html: string,
  options: { raw?: boolean; stripLinks?: boolean } = {}
): string {
  const extracted = extractContent(html, {
    baseUrl: BASE_URL,
    raw: options.raw,
  });
  const withTables = convertTablesToJson(extracted.html);
  const withImages = annotateImages(withTables, BASE_URL);
  return convertHtmlToMarkdown(withImages, {
    baseUrl: BASE_URL,
    stripLinks: options.stripLinks,
  });
}

const SIMPLE_ARTICLE = `
<html>
<head><title>Test Article</title></head>
<body>
  <article>
    <h1>Hello World</h1>
    <p>This is a <strong>simple</strong> paragraph with some text.</p>
    <h2>Section Two</h2>
    <p>Another paragraph here.</p>
  </article>
</body>
</html>`;

const TABLE_HTML = `
<html>
<head><title>Table Page</title></head>
<body>
  <article>
    <h1>Data Report</h1>
    <table>
      <thead><tr><th>Name</th><th>Value</th></tr></thead>
      <tbody>
        <tr><td>Alpha</td><td>100</td></tr>
        <tr><td>Beta</td><td>200</td></tr>
      </tbody>
    </table>
    <p>End of report.</p>
  </article>
</body>
</html>`;

const IMAGE_HTML = `
<html>
<head><title>Image Page</title></head>
<body>
  <article>
    <h1>Gallery</h1>
    <figure>
      <img src="/photo.jpg" alt="A photo">
      <figcaption>A beautiful landscape</figcaption>
    </figure>
    <p>Some text after the image.</p>
  </article>
</body>
</html>`;

describe("extract→convert pipeline determinism", () => {
  describe("same input produces same output", () => {
    it("simple article HTML", () => {
      const first = runPipeline(SIMPLE_ARTICLE);
      const second = runPipeline(SIMPLE_ARTICLE);
      expect(first).toBe(second);
      expect(first.length).toBeGreaterThan(0);
    });

    it("HTML with tables", () => {
      const first = runPipeline(TABLE_HTML);
      const second = runPipeline(TABLE_HTML);
      expect(first).toBe(second);
      expect(first).toContain("json");
      expect(first).toContain("Alpha");
    });

    it("HTML with images and figcaptions", () => {
      const first = runPipeline(IMAGE_HTML);
      const second = runPipeline(IMAGE_HTML);
      expect(first).toBe(second);
      expect(first).toContain("photo.jpg");
      expect(first).toContain("A beautiful landscape");
    });
  });

  describe("different options produce different output", () => {
    it("raw: true vs default produces different markdown", () => {
      const defaultOutput = runPipeline(SIMPLE_ARTICLE);
      const rawOutput = runPipeline(SIMPLE_ARTICLE, { raw: true });
      expect(defaultOutput).not.toBe(rawOutput);
    });

    it("stripLinks: true vs default produces different markdown", () => {
      const htmlWithLinks = `
<html>
<head><title>Links Page</title></head>
<body>
  <article>
    <h1>Links</h1>
    <p>Visit <a href="https://example.com/page">this page</a> for more info.</p>
  </article>
</body>
</html>`;

      const defaultOutput = runPipeline(htmlWithLinks);
      const strippedOutput = runPipeline(htmlWithLinks, { stripLinks: true });
      expect(defaultOutput).not.toBe(strippedOutput);
      expect(defaultOutput).toContain("[this page]");
      expect(strippedOutput).not.toContain("[this page]");
    });
  });
});
