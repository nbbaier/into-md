import { describe, expect, it } from "bun:test";
import { parseDocument, parseFragment, toAbsoluteUrl } from "./utils";

describe("toAbsoluteUrl", () => {
  it("resolves a root-relative path against the base", () => {
    expect(toAbsoluteUrl("/about", "https://example.com")).toBe(
      "https://example.com/about"
    );
  });

  it("resolves a relative path against a nested base", () => {
    expect(toAbsoluteUrl("page", "https://example.com/docs/")).toBe(
      "https://example.com/docs/page"
    );
  });

  it("passes through an already-absolute url", () => {
    expect(toAbsoluteUrl("https://other.com/x", "https://example.com")).toBe(
      "https://other.com/x"
    );
  });

  it("returns undefined for undefined input", () => {
    expect(toAbsoluteUrl(undefined, "https://example.com")).toBeUndefined();
  });

  it("returns the original url when the base is unparseable", () => {
    // `new URL("/x", "not a url")` throws -> catch returns the input unchanged.
    expect(toAbsoluteUrl("/x", "not a url")).toBe("/x");
  });
});

describe("parseDocument", () => {
  it("parses a complete document", () => {
    const document = parseDocument(
      "<html><head><title>T</title></head><body><p>hi</p></body></html>"
    );
    expect(document.title).toBe("T");
    expect(document.body.innerHTML).toBe("<p>hi</p>");
  });

  it("tolerates scripts after </body>", () => {
    const document = parseDocument(
      "<html><body><p>hi</p></body><script>x()</script></html>"
    );
    expect(document.body.innerHTML).toBe("<p>hi</p>");
  });

  it("puts content into <body> when optional tags are omitted", () => {
    const document = parseDocument(
      "<!doctype html><title>T</title><p>one</p><p>two</p>"
    );
    expect(document.title).toBe("T");
    expect(document.body.innerHTML).toBe("<p>one</p><p>two</p>");
  });

  it("keeps content when only <body> is omitted", () => {
    const document = parseDocument(
      "<html><head><title>T</title></head><p>no body tag</p></html>"
    );
    expect(document.body.textContent).toBe("no body tag");
  });

  it("wraps a bare fragment in a document", () => {
    const document = parseDocument("<p>a</p><p>b</p>");
    expect(document.documentElement.nodeName).toBe("HTML");
    expect(document.body.innerHTML).toBe("<p>a</p><p>b</p>");
  });
});

describe("parseFragment", () => {
  it("returns a container whose children are the fragment", () => {
    const root = parseFragment("<h1>T</h1><p>x</p>");
    expect(root.innerHTML).toBe("<h1>T</h1><p>x</p>");
  });
});
