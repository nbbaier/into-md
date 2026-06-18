import { describe, expect, it } from "bun:test";
import { convertHtmlToMarkdown } from "./converter";

const baseUrl = "https://example.com";

const BULLET_ONE = /^- +one$/m;
const BULLET_TWO = /^- +two$/m;

describe("convertHtmlToMarkdown", () => {
  it("renders atx-style headings", () => {
    expect(convertHtmlToMarkdown("<h1>Title</h1>", { baseUrl })).toBe(
      "# Title"
    );
  });

  it("uses '-' as the bullet list marker", () => {
    const md = convertHtmlToMarkdown("<ul><li>one</li><li>two</li></ul>", {
      baseUrl,
    });
    expect(md).toMatch(BULLET_ONE);
    expect(md).toMatch(BULLET_TWO);
  });

  it("rewrites relative links to absolute and keeps link syntax", () => {
    const md = convertHtmlToMarkdown('<a href="/about">About</a>', { baseUrl });
    expect(md).toBe("[About](https://example.com/about)");
  });

  it("strips link syntax but keeps text when stripLinks is set", () => {
    const md = convertHtmlToMarkdown('<a href="/about">About</a>', {
      baseUrl,
      stripLinks: true,
    });
    expect(md).toBe("About");
  });

  it("rewrites relative image sources to absolute", () => {
    const md = convertHtmlToMarkdown('<img src="/img.png" alt="Alt">', {
      baseUrl,
    });
    expect(md).toBe("![Alt](https://example.com/img.png)");
  });

  it("appends a caption line when data-into-md-caption is present", () => {
    const md = convertHtmlToMarkdown(
      '<img src="/i.png" alt="A" data-into-md-caption="Cap">',
      { baseUrl }
    );
    expect(md).toBe("![A](https://example.com/i.png)\n*Cap*");
  });

  it("replaces embeds with a labelled placeholder", () => {
    const md = convertHtmlToMarkdown(
      '<iframe src="https://video.example/x"></iframe>',
      { baseUrl }
    );
    expect(md).toBe("[Embedded content: https://video.example/x]");
  });

  it("drops embeds that have no src", () => {
    const md = convertHtmlToMarkdown("<p>text</p><iframe></iframe>", {
      baseUrl,
    });
    expect(md.trim()).toBe("text");
  });

  it("removes script and style elements", () => {
    const md = convertHtmlToMarkdown(
      "<script>danger()</script><style>p{}</style><p>Hello</p>",
      { baseUrl }
    );
    expect(md).toBe("Hello");
    expect(md).not.toContain("danger");
  });
});
