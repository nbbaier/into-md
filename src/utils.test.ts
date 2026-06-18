import { describe, expect, it } from "bun:test";
import { load } from "cheerio";
import { getBodyHtml, toAbsoluteUrl } from "./utils";

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

describe("getBodyHtml", () => {
  it("returns the inner html of the body element", () => {
    const $ = load("<body><p>hi</p></body>");
    expect(getBodyHtml($)).toBe("<p>hi</p>");
  });

  it("falls back to root html when there is no body (fragment mode)", () => {
    // Fragment mode (third arg false) does not synthesize a <body>.
    const $ = load("<p>hi</p>", null, false);
    expect(getBodyHtml($)).toContain("<p>hi</p>");
  });
});
