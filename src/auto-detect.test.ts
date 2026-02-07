import { describe, expect, it } from "bun:test";
import { detectNeedForBrowser } from "./auto-detect";

describe("getBodyTextCount", () => {
  it("counts body text excluding scripts and styles", async () => {
    const html = `
      <html><body>
        <script>console.log("test");</script>
        <style>body { color: red; }</style>
        <p>Hello world</p>
      </body></html>
    `;
    const detection = await detectNeedForBrowser(html, html);
    expect(detection.shouldFallback).toBe(false);
  });

  it("handles empty body", async () => {
    const html = "<html><body></body></html>";
    const extracted = "<body></body>";
    const detection = await detectNeedForBrowser(html, extracted);
    expect(detection.shouldFallback).toBe(true);
  });
});

describe("isEmptyRootDiv", () => {
  it("detects empty root div for known SPA IDs", async () => {
    const html = '<html><body><div id="root"></div></body></html>';
    const detection = await detectNeedForBrowser(html, html);
    expect(detection.shouldFallback).toBe(true);
    expect(detection.reason).toContain("Empty SPA root");
  });

  it("detects empty app div", async () => {
    const html = '<html><body><div id="app"></div></body></html>';
    const detection = await detectNeedForBrowser(html, html);
    expect(detection.shouldFallback).toBe(true);
  });

  it("detects empty __next div", async () => {
    const html = '<html><body><div id="__next"></div></body></html>';
    const detection = await detectNeedForBrowser(html, html);
    expect(detection.shouldFallback).toBe(true);
  });

  it("passes when root div has meaningful content", async () => {
    const html =
      '<html><body><div id="root"><p>Content here</p></div></body></html>';
    const detection = await detectNeedForBrowser(html, html);
    expect(detection.shouldFallback).toBe(false);
  });

  it("passes when root div is not present", async () => {
    const html = "<html><body><p>Regular content</p></body></html>";
    const detection = await detectNeedForBrowser(html, html);
    expect(detection.shouldFallback).toBe(false);
  });
});

describe("hasNoscriptAndEmptyBody", () => {
  it("triggers when noscript has javascript and body is sparse", async () => {
    const html = `
      <html><body>
        <noscript>JavaScript is required</noscript>
        <p>Short</p>
      </body></html>
    `;
    const detection = await detectNeedForBrowser(html, html);
    expect(detection.shouldFallback).toBe(true);
    expect(detection.reason).toContain("Noscript");
  });

  it("passes when body has sufficient content", async () => {
    const html = `
      <html><body>
        <noscript>JavaScript is required</noscript>
        ${"a".repeat(150)}
      </body></html>
    `;
    const extracted = `<body>${"a".repeat(250)}</body>`;
    const detection = await detectNeedForBrowser(html, extracted);
    expect(detection.shouldFallback).toBe(false);
  });

  it("passes when noscript is in cookie banner", async () => {
    const html = `
      <html><body>
        <div class="cookie-banner">
          <noscript>Enable javascript</noscript>
        </div>
      </body></html>
    `;
    const extracted =
      '<body><div class="cookie-banner"><p>Content after extraction</p></div></body>';
    const detection = await detectNeedForBrowser(html, extracted);
    expect(detection.shouldFallback).toBe(false);
  });
});

describe("isContentTooSparse", () => {
  it("triggers when content is short and lacks structure", async () => {
    const html = "<html><body>Short</body></html>";
    const extractedHtml = "<div>Short</div>";
    const detection = await detectNeedForBrowser(html, extractedHtml);
    expect(detection.shouldFallback).toBe(true);
    expect(detection.reason).toContain("too sparse");
  });

  it("passes when content is short but has structure", async () => {
    const html = "<html><body>Short</body></html>";
    const extractedHtml = "<p>Short</p>";
    const detection = await detectNeedForBrowser(html, extractedHtml);
    expect(detection.shouldFallback).toBe(false);
  });

  it("passes when content is long enough", async () => {
    const html = `<html><body>${"a".repeat(250)}</body></html>`;
    const extractedHtml = `<div>${"a".repeat(250)}</div>`;
    const detection = await detectNeedForBrowser(html, extractedHtml);
    expect(detection.shouldFallback).toBe(false);
  });
});

describe("detectNeedForBrowser", () => {
  it("falls back to browser on empty root div", async () => {
    const html = '<html><body><div id="root"></div></body></html>';
    const detection = await detectNeedForBrowser(html, html);
    expect(detection.shouldFallback).toBe(true);
  });

  it("falls back to browser on noscript + empty body", async () => {
    const html = `
      <html><body>
        <noscript>JavaScript required</noscript>
        <p>Short</p>
      </body></html>
    `;
    const detection = await detectNeedForBrowser(html, html);
    expect(detection.shouldFallback).toBe(true);
  });

  it("falls back to browser on sparse extracted content", async () => {
    const html = "<html><body>Short</body></html>";
    const extractedHtml = "<div>Short</div>";
    const detection = await detectNeedForBrowser(html, extractedHtml);
    expect(detection.shouldFallback).toBe(true);
  });

  it("passes static fetch when content is good", async () => {
    const html = "<html><body><p>Good content here</p></body></html>";
    const detection = await detectNeedForBrowser(html, html);
    expect(detection.shouldFallback).toBe(false);
  });

  it("skips Stage 2 in raw mode", async () => {
    const html = "<html><body>Short</body></html>";
    const extractedHtml = "<div>Short</div>";
    const detection = await detectNeedForBrowser(html, extractedHtml, {
      raw: true,
    });
    expect(detection.shouldFallback).toBe(false);
  });
});
