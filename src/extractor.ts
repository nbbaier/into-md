import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

export interface ExtractOptions {
  raw?: boolean;
  excludeSelectors?: string[];
  baseUrl: string;
}

export interface ExtractedContent {
  html: string;
  metadata: {
    title?: string;
    description?: string;
    author?: string;
    source: string;
  };
}

function removeNodes(document: Document, selectors: string[]) {
  for (const selector of selectors) {
    document.querySelectorAll(selector)?.forEach((node) => node.remove());
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

export function extractContent(
  html: string,
  { raw = false, excludeSelectors = [], baseUrl }: ExtractOptions
): ExtractedContent {
  const dom = new JSDOM(html, { url: baseUrl });
  const {document} = dom.window;

  if (excludeSelectors.length) {
    removeNodes(document, excludeSelectors);
  }

  if (raw) {
    const metadata = extractMetadata(document, baseUrl);
    return { html: document.documentElement.outerHTML, metadata };
  }

  const clone = document.cloneNode(true) as Document;
  const reader = new Readability(clone);
  const article = reader.parse();

  const contentHtml =
    article?.content ?? document.querySelector("body")?.innerHTML ?? "";
  const metadata = extractMetadata(document, baseUrl);
  if (article?.title && !metadata.title) {
    metadata.title = article.title;
  }
  if (article?.byline && !metadata.author) {
    metadata.author = article.byline;
  }
  return { html: contentHtml, metadata };
}
