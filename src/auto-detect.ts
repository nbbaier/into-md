import { JSDOM } from "jsdom";

const STAGE_1_BODY_TEXT_MIN = 100;
const STAGE_2_CONTENT_MIN = 200;
const STAGE_2_STRUCTURAL_TAGS = [
  "article",
  "p",
  "pre",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
];
const SPA_ROOT_IDS = ["root", "app", "__next", "__nuxt", "__svelte"];

function getBodyTextCount(html: string): number {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const body = document.querySelector("body");
  if (!body) {
    return 0;
  }

  const clone = body.cloneNode(true) as HTMLElement;
  for (const el of Array.from(clone.querySelectorAll("script, style"))) {
    el.remove();
  }

  return clone.textContent?.trim().length ?? 0;
}

function isCookieBannerWrapper(element: Element | null): boolean {
  if (!element) {
    return false;
  }

  let parent = element.parentElement;
  while (parent) {
    const className = parent.className?.toLowerCase() ?? "";
    const id = parent.id?.toLowerCase() ?? "";

    if (
      className.includes("cookie") ||
      className.includes("consent") ||
      className.includes("banner") ||
      id.includes("cookie") ||
      id.includes("consent") ||
      id.includes("banner")
    ) {
      return true;
    }

    parent = parent.parentElement;
  }

  return false;
}

function isEmptyRootDiv(html: string): boolean {
  const dom = new JSDOM(html);
  const { document } = dom.window;

  for (const rootId of SPA_ROOT_IDS) {
    const rootEl = document.getElementById(rootId);
    if (!rootEl) {
      continue;
    }

    const clone = rootEl.cloneNode(true) as HTMLElement;
    for (const el of Array.from(clone.querySelectorAll("script, style"))) {
      el.remove();
    }

    const textContent = clone.textContent?.trim() ?? "";
    const hasNonEmptyChildren = Array.from(clone.children).some(
      (child) =>
        !["script", "style"].includes(child.tagName.toLowerCase()) &&
        (child.textContent?.trim().length ?? 0) > 0
    );

    if (!hasNonEmptyChildren && textContent.length < STAGE_1_BODY_TEXT_MIN) {
      return true;
    }
  }

  return false;
}

function hasNoscriptAndEmptyBody(html: string): boolean {
  const dom = new JSDOM(html);
  const { document } = dom.window;

  const noscript = document.querySelector("noscript");
  if (!noscript) {
    return false;
  }

  const noscriptText = noscript.textContent?.toLowerCase() ?? "";
  if (!noscriptText.includes("javascript")) {
    return false;
  }

  if (isCookieBannerWrapper(noscript)) {
    return false;
  }

  const bodyTextCount = getBodyTextCount(html);
  if (bodyTextCount >= STAGE_1_BODY_TEXT_MIN) {
    return false;
  }

  return true;
}

function isContentTooSparse(extractedHtml: string): boolean {
  const dom = new JSDOM(extractedHtml);
  const { document } = dom.window;

  const textContent = document.body?.textContent?.trim() ?? "";
  if (textContent.length >= STAGE_2_CONTENT_MIN) {
    return false;
  }

  const hasStructuralTags = STAGE_2_STRUCTURAL_TAGS.some((tag) =>
    document.querySelector(tag)
  );

  return !hasStructuralTags;
}

export interface DetectionResult {
  shouldFallback: boolean;
  reason?: string;
}

export function detectNeedForBrowser(
  rawHtml: string,
  extractedHtml: string,
  options: { verbose?: boolean; raw?: boolean } = {}
): DetectionResult {
  if (isEmptyRootDiv(rawHtml)) {
    return { shouldFallback: true, reason: "Empty SPA root div detected" };
  }

  if (hasNoscriptAndEmptyBody(rawHtml)) {
    return {
      shouldFallback: true,
      reason: "Noscript with javascript and sparse body",
    };
  }

  if (!options.raw && isContentTooSparse(extractedHtml)) {
    return { shouldFallback: true, reason: "Extracted content is too sparse" };
  }

  return { shouldFallback: false };
}
