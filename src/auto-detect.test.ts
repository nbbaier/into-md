import { describe, expect, it } from "bun:test";
import { detectNeedForBrowser } from "./auto-detect";

describe("getBodyTextCount", () => {
  it("counts body text excluding scripts and styles", () => {
    const html = `
      <html><body>
        <script>console.log("test");</script>
        <style>body { color: red; }</style>
        <p>Hello world</p>
      </body></html>
    `;
    const detection = detectNeedForBrowser(html, html);
    expect(detection.shouldFallback).toBe(false);
  });

  it("does not trigger on empty body without SPA signals", () => {
    const html = "<html><body></body></html>";
    const detection = detectNeedForBrowser(html, null, {
      stage: "stage1",
    });
    expect(detection.shouldFallback).toBe(false);
  });
});

describe("isEmptyRootDiv", () => {
  it("detects empty root div for known SPA IDs", () => {
    const html = '<html><body><div id="root"></div></body></html>';
    const detection = detectNeedForBrowser(html, html);
    expect(detection.shouldFallback).toBe(true);
    expect(detection.reason).toContain("Empty SPA root");
  });

  it("detects empty app div", () => {
    const html = '<html><body><div id="app"></div></body></html>';
    const detection = detectNeedForBrowser(html, html);
    expect(detection.shouldFallback).toBe(true);
  });

  it("detects empty __next div", () => {
    const html = '<html><body><div id="__next"></div></body></html>';
    const detection = detectNeedForBrowser(html, html);
    expect(detection.shouldFallback).toBe(true);
  });

  it("treats loading indicator text as empty", () => {
    const html =
      '<html><body><div id="root"><span>Loading...</span></div></body></html>';
    const detection = detectNeedForBrowser(html, html);
    expect(detection.shouldFallback).toBe(true);
    expect(detection.reason).toContain("Empty SPA root");
  });

  it("passes when root div has meaningful content", () => {
    const html =
      '<html><body><div id="root"><p>Content here</p></div></body></html>';
    const detection = detectNeedForBrowser(html, html);
    expect(detection.shouldFallback).toBe(false);
  });

  it("passes when root div is not present", () => {
    const html = "<html><body><p>Regular content</p></body></html>";
    const detection = detectNeedForBrowser(html, html);
    expect(detection.shouldFallback).toBe(false);
  });

  it("treats empty nested div inside root as not meaningful", () => {
    const html = '<html><body><div id="root"><div></div></div></body></html>';
    const detection = detectNeedForBrowser(html, html);
    expect(detection.shouldFallback).toBe(true);
    expect(detection.reason).toContain("Empty SPA root");
  });

  it("treats div with only whitespace text as not meaningful", () => {
    const html =
      '<html><body><div id="app"><span>   </span></div></body></html>';
    const detection = detectNeedForBrowser(html, html);
    expect(detection.shouldFallback).toBe(true);
    expect(detection.reason).toContain("Empty SPA root");
  });
});

describe("hasNoscriptAndEmptyBody", () => {
  it("triggers when noscript has javascript and body is sparse", () => {
    const html = `
      <html><body>
        <noscript>JavaScript is required</noscript>
        <p>Short</p>
      </body></html>
    `;
    const detection = detectNeedForBrowser(html, html);
    expect(detection.shouldFallback).toBe(true);
    expect(detection.reason).toContain("Noscript");
  });

  it("passes when body has sufficient content", () => {
    const html = `
      <html><body>
        <noscript>JavaScript is required</noscript>
        ${"a".repeat(150)}
      </body></html>
    `;
    const extracted = `<body>${"a".repeat(250)}</body>`;
    const detection = detectNeedForBrowser(html, extracted, {
      stage: "stage1",
    });
    expect(detection.shouldFallback).toBe(false);
  });

  it("passes when noscript is in cookie banner", () => {
    const html = `
      <html><body>
        <div class="cookie-banner">
          <noscript>Enable javascript</noscript>
        </div>
      </body></html>
    `;
    const extracted =
      '<body><div class="cookie-banner"><p>Content after extraction</p></div></body>';
    const detection = detectNeedForBrowser(html, extracted, {
      stage: "stage1",
    });
    expect(detection.shouldFallback).toBe(false);
  });

  it("triggers when qualifying noscript is not the first one", () => {
    const html = `
      <html><body>
        <noscript>Please enable cookies</noscript>
        <noscript>JavaScript is required</noscript>
      </body></html>
    `;
    const detection = detectNeedForBrowser(html, null, { stage: "stage1" });
    expect(detection.shouldFallback).toBe(true);
    expect(detection.reason).toContain("Noscript");
  });

  it("skips cookie-banner noscript but triggers on a later qualifying one", () => {
    const html = `
      <html><body>
        <div class="consent-banner">
          <noscript>JavaScript is needed for consent</noscript>
        </div>
        <noscript>You need JavaScript to run this app</noscript>
      </body></html>
    `;
    const detection = detectNeedForBrowser(html, null, { stage: "stage1" });
    expect(detection.shouldFallback).toBe(true);
    expect(detection.reason).toContain("Noscript");
  });
});

describe("isContentTooSparse", () => {
  it("triggers when content is short and lacks structure", () => {
    const html = "<html><body>Short</body></html>";
    const extractedHtml = "<div>Short</div>";
    const detection = detectNeedForBrowser(html, extractedHtml, {
      stage: "stage2",
    });
    expect(detection.shouldFallback).toBe(true);
    expect(detection.reason).toContain("too sparse");
  });

  it("passes when content is short but has structure", () => {
    const html = "<html><body>Short</body></html>";
    const extractedHtml = "<p>Short</p>";
    const detection = detectNeedForBrowser(html, extractedHtml, {
      stage: "stage2",
    });
    expect(detection.shouldFallback).toBe(false);
  });

  it("passes when content is long enough", () => {
    const html = `<html><body>${"a".repeat(250)}</body></html>`;
    const extractedHtml = `<div>${"a".repeat(250)}</div>`;
    const detection = detectNeedForBrowser(html, extractedHtml, {
      stage: "stage2",
    });
    expect(detection.shouldFallback).toBe(false);
  });
});

describe("detectNeedForBrowser", () => {
  it("falls back to browser on empty root div", () => {
    const html = '<html><body><div id="root"></div></body></html>';
    const detection = detectNeedForBrowser(html, html);
    expect(detection.shouldFallback).toBe(true);
  });

  it("falls back to browser on noscript + empty body", () => {
    const html = `
      <html><body>
        <noscript>JavaScript required</noscript>
        <p>Short</p>
      </body></html>
    `;
    const detection = detectNeedForBrowser(html, html);
    expect(detection.shouldFallback).toBe(true);
  });

  it("falls back to browser on sparse extracted content", () => {
    const html = "<html><body>Short</body></html>";
    const extractedHtml = "<div>Short</div>";
    const detection = detectNeedForBrowser(html, extractedHtml, {
      stage: "stage2",
    });
    expect(detection.shouldFallback).toBe(true);
  });

  it("passes static fetch when content is good", () => {
    const html = "<html><body><p>Good content here</p></body></html>";
    const detection = detectNeedForBrowser(html, html);
    expect(detection.shouldFallback).toBe(false);
  });

  it("skips Stage 2 in raw mode", () => {
    const html = "<html><body>Short</body></html>";
    const extractedHtml = "<div>Short</div>";
    const detection = detectNeedForBrowser(html, extractedHtml, {
      raw: true,
      stage: "stage2",
    });
    expect(detection.shouldFallback).toBe(false);
  });
});
