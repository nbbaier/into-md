import { describe, expect, it } from "bun:test";
import { extractContent } from "./extractor";

const baseUrl = "https://example.com/post";

const article = `<!doctype html>
<html>
  <head>
    <title>The Title</title>
    <meta name="description" content="A short summary.">
    <meta name="author" content="Ada Lovelace">
  </head>
  <body>
    <nav class="site-nav">SHOULD NOT APPEAR</nav>
    <article>
      <h1>The Title</h1>
      <p>${"This is a reasonably long paragraph of article body text. ".repeat(8)}</p>
      <p>${"A second paragraph keeps Readability happy with content. ".repeat(8)}</p>
    </article>
  </body>
</html>`;

describe("extractContent metadata", () => {
  it("reads title, description, and author from meta tags", () => {
    const { metadata } = extractContent(article, { baseUrl, raw: true });
    expect(metadata.title).toBe("The Title");
    expect(metadata.description).toBe("A short summary.");
    expect(metadata.author).toBe("Ada Lovelace");
    expect(metadata.source).toBe(baseUrl);
  });

  it("falls back to og:title when there is no <title>", () => {
    const html =
      '<html><head><meta property="og:title" content="OG Title">' +
      "</head><body><p>x</p></body></html>";
    const { metadata } = extractContent(html, { baseUrl, raw: true });
    expect(metadata.title).toBe("OG Title");
  });
});

describe("extractContent raw mode", () => {
  it("returns the full document html", () => {
    const { html } = extractContent(article, { baseUrl, raw: true });
    expect(html).toContain("<html");
    expect(html).toContain("The Title");
  });

  it("removes nodes matched by excludeSelectors", () => {
    const { html } = extractContent(article, {
      baseUrl,
      raw: true,
      excludeSelectors: ["nav.site-nav"],
    });
    expect(html).not.toContain("SHOULD NOT APPEAR");
  });
});

describe("extractContent readability mode", () => {
  it("returns extracted article content for a normal page", () => {
    const { html } = extractContent(article, { baseUrl });
    expect(html.length).toBeGreaterThan(0);
    expect(html).toContain("article body text");
  });

  it("drops chrome like the nav in extracted mode", () => {
    const { html } = extractContent(article, { baseUrl });
    expect(html).not.toContain("SHOULD NOT APPEAR");
  });
});
