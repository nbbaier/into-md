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
const LOADING_INDICATORS = ["loading", "loading..."];

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

  const text = clone.textContent ?? "";
  return text.replace(/\s+/g, " ").trim().length;
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

function isLoadingIndicator(text: string): boolean {
  return LOADING_INDICATORS.includes(text.trim().toLowerCase());
}

function hasMeaningfulChildren(element: HTMLElement): boolean {
  for (const child of Array.from(element.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag === "script" || tag === "style") {
      continue;
    }
    const childText = child.textContent?.trim() ?? "";
    if (childText.length > 0 && !isLoadingIndicator(childText)) {
      return true;
    }
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

    if (hasMeaningfulChildren(clone)) {
      continue;
    }

    const textContent = clone.textContent?.trim() ?? "";
    if (textContent.length === 0 || isLoadingIndicator(textContent)) {
      return true;
    }
  }

  return false;
}

function hasNoscriptAndEmptyBody(html: string): boolean {
  const dom = new JSDOM(html);
  const { document } = dom.window;

  const noscripts = document.querySelectorAll("noscript");
  if (noscripts.length === 0) {
    return false;
  }

  let hasQualifyingNoscript = false;
  for (const noscript of Array.from(noscripts)) {
    const noscriptText = noscript.textContent?.toLowerCase() ?? "";
    if (!noscriptText.includes("javascript")) {
      continue;
    }

    if (isCookieBannerWrapper(noscript)) {
      continue;
    }

    hasQualifyingNoscript = true;
    break;
  }

  if (!hasQualifyingNoscript) {
    return false;
  }

  const bodyTextCount = getBodyTextCount(html);
  return bodyTextCount < STAGE_1_BODY_TEXT_MIN;
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

interface DetectionResult {
  shouldFallback: boolean;
  reason?: string;
}

type DetectionStage = "stage1" | "stage2" | "both";

export function detectNeedForBrowser(
  rawHtml: string,
  extractedHtml?: string | null,
  options: { verbose?: boolean; raw?: boolean; stage?: DetectionStage } = {}
): DetectionResult {
  const stage = options.stage ?? "both";

  if (stage !== "stage2") {
    if (isEmptyRootDiv(rawHtml)) {
      return { shouldFallback: true, reason: "Empty SPA root div detected" };
    }

    if (hasNoscriptAndEmptyBody(rawHtml)) {
      return {
        shouldFallback: true,
        reason: "Noscript with javascript and sparse body",
      };
    }
  }

  if (stage !== "stage1" && !options.raw) {
    const hasExtracted = extractedHtml !== undefined && extractedHtml !== null;
    if (hasExtracted && isContentTooSparse(extractedHtml)) {
      return {
        shouldFallback: true,
        reason: "Extracted content is too sparse",
      };
    }
  }

  return { shouldFallback: false };
}
