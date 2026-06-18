import { describe, expect, it } from "bun:test";
import { buildFrontmatter, parseFrontmatter } from "./metadata";

describe("parseFrontmatter", () => {
  it("returns the body unchanged when there is no frontmatter", () => {
    const { fields, body } = parseFrontmatter("# Hello\n\nbody text");
    expect(fields).toEqual({});
    expect(body).toBe("# Hello\n\nbody text");
  });

  it("parses key/value pairs and separates the body", () => {
    const { fields, body } = parseFrontmatter(
      '---\ntitle: "Hi"\nsource: "https://example.com"\n---\nBody'
    );
    expect(fields.title).toBe("Hi");
    expect(fields.source).toBe("https://example.com");
    expect(body).toBe("Body");
  });

  it("strips surrounding single or double quotes from values", () => {
    const { fields } = parseFrontmatter("---\na: \"x\"\nb: 'y'\nc: z\n---\n");
    expect(fields.a).toBe("x");
    expect(fields.b).toBe("y");
    expect(fields.c).toBe("z");
  });

  it("ignores lines without a colon", () => {
    const { fields } = parseFrontmatter("---\nnocolon\ntitle: ok\n---\n");
    expect(fields).toEqual({ title: "ok" });
  });
});

describe("buildFrontmatter", () => {
  it("emits known fields with source last", () => {
    const fm = buildFrontmatter({
      title: "T",
      source: "https://example.com",
    });
    expect(fm.startsWith("---\n")).toBe(true);
    expect(fm.endsWith("\n---")).toBe(true);
    expect(fm).toContain('title: "T"');
    expect(fm).toContain('source: "https://example.com"');
  });

  it("escapes embedded double quotes", () => {
    const fm = buildFrontmatter({ title: 'a "quote"', source: "s" });
    expect(fm).toContain(String.raw`title: "a \"quote\""`);
  });

  it("emits unknown extra fields ahead of the known ones", () => {
    const fm = buildFrontmatter({
      source: "s",
      extraFields: { custom: "v" },
    });
    expect(fm).toContain('custom: "v"');
    expect(fm.indexOf("custom:")).toBeLessThan(fm.indexOf("source:"));
  });

  it("round-trips simple values through parse", () => {
    const fm = buildFrontmatter({
      title: "Round Trip",
      author: "Ada",
      source: "https://example.com/a",
    });
    const { fields } = parseFrontmatter(`${fm}\nbody`);
    expect(fields.title).toBe("Round Trip");
    expect(fields.author).toBe("Ada");
    expect(fields.source).toBe("https://example.com/a");
  });
});
