import { Readability } from "@mozilla/readability";

import { parseDocument } from "./utils";

interface ExtractOptions {
  baseUrl: string;
  excludeSelectors?: string[];
  raw?: boolean;
}

export interface ExtractedContent {
  /** Element whose children are the extracted content */
  content: HTMLElement;
  metadata: {
    title?: string;
    description?: string;
    author?: string;
    source: string;
  };
}

function removeNodes(document: Document, selectors: string[]) {
  for (const selector of selectors) {
    for (const node of Array.from(document.querySelectorAll(selector))) {
      node.remove();
    }
  }
}

function extractMetadata(document: Document, source: string) {
  const title =
    document.querySelector("title")?.textContent ??
    document
      .querySelector('meta[property="og:title"]')
      ?.getAttribute("content") ??
    undefined;

  const description =
    document
      .querySelector('meta[name="description"]')
      ?.getAttribute("content") ??
    document
      .querySelector('meta[property="og:description"]')
      ?.getAttribute("content") ??
    undefined;

  const author =
    document.querySelector('meta[name="author"]')?.getAttribute("content") ??
    document
      .querySelector('meta[property="article:author"]')
      ?.getAttribute("content") ??
    undefined;

  return { author, description, source, title: title ?? undefined };
}

/**
 * Gives a linkedom document the URL Readability resolves relative links
 * against. linkedom has no document URL and returns `<base href>` unresolved.
 */
function setDocumentUrl(document: Document, url: string): void {
  let baseUri = url;
  const baseHref = document.querySelector("base[href]")?.getAttribute("href");
  if (baseHref) {
    try {
      baseUri = new URL(baseHref, url).href;
    } catch {
      // Invalid <base href>: keep the document URL.
    }
  }
  Object.defineProperty(document, "documentURI", { value: url });
  Object.defineProperty(document, "baseURI", { value: baseUri });
}

/**
 * Extracts the main content and metadata. When given a parsed document, nodes
 * matched by `excludeSelectors` are removed from it in place, and raw mode
 * returns its `<body>`; Readability always runs on a clone.
 */
export function extractContent(
  input: string | Document,
  { raw = false, excludeSelectors = [], baseUrl }: ExtractOptions
): ExtractedContent {
  const document = typeof input === "string" ? parseDocument(input) : input;

  if (excludeSelectors.length) {
    removeNodes(document, excludeSelectors);
  }

  const metadata = extractMetadata(document, baseUrl);
  if (raw) {
    return { content: document.body, metadata };
  }

  const clone = document.cloneNode(true) as Document;
  setDocumentUrl(clone, baseUrl);
  const article = new Readability<HTMLElement>(clone, {
    serializer: (node) => node as HTMLElement,
  }).parse();

  if (article?.title && !metadata.title) {
    metadata.title = article.title;
  }
  if (article?.byline && !metadata.author) {
    metadata.author = article.byline;
  }
  return { content: article?.content ?? document.body, metadata };
}
