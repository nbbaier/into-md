import type { CheerioAPI } from "cheerio";

/**
 * Converts a relative URL to an absolute URL using the provided base URL.
 * Returns the original URL if it cannot be parsed.
 */
export const toAbsoluteUrl = (
  url: string | undefined,
  baseUrl: string
): string | undefined => {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
};

/**
 * Extracts the inner HTML from the body element, or falls back to root HTML.
 * Common pattern used across multiple cheerio-based transformations.
 */
export const getBodyHtml = ($: CheerioAPI): string => {
  const body = $("body");
  return body.length ? (body.html() ?? "") : ($.root().html() ?? "");
};
