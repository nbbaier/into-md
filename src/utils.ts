import { parseHTML } from "linkedom";
import { parse, serialize } from "parse5";

/**
 * Converts a relative URL to an absolute URL using the provided base URL.
 * Returns the original URL if it cannot be parsed.
 */
export const toAbsoluteUrl = (
  url: string | null | undefined,
  baseUrl: string
): string | undefined => {
  if (!url) {
    return;
  }
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
};

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
/** Elements that may harmlessly sit outside <body> (e.g. scripts after </body>). */
const NON_CONTENT_TAGS = new Set([
  "LINK",
  "META",
  "NOSCRIPT",
  "SCRIPT",
  "STYLE",
  "TEMPLATE",
]);

const isStrayContent = (node: Node): boolean => {
  if (node.nodeType === TEXT_NODE) {
    return Boolean(node.textContent?.trim());
  }
  return node.nodeType === ELEMENT_NODE && !NON_CONTENT_TAGS.has(node.nodeName);
};

/**
 * linkedom does not run the HTML5 tree-construction algorithm, so documents
 * that omit optional `<html>`/`<body>` tags (or bare fragments) come out with
 * content outside `<body>` or a non-`<html>` root.
 */
const hasStandardStructure = (document: Document): boolean => {
  const root = document.documentElement;
  if (root?.nodeName !== "HTML") {
    return false;
  }
  for (const node of Array.from(document.childNodes)) {
    if (node !== root && isStrayContent(node)) {
      return false;
    }
  }
  let hasBody = false;
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeName === "BODY") {
      hasBody = true;
    } else if (node.nodeName !== "HEAD" && isStrayContent(node)) {
      return false;
    }
  }
  return hasBody;
};

/**
 * Brings a linkedom tree closer to what a browser (and JSDOM) builds, which
 * Readability's scoring and Turndown's escaping depend on:
 * - `<template>` contents are inert, but linkedom exposes them as children;
 * - rows placed directly in a `<table>` get an implicit `<tbody>`;
 * - text split at entities (`a &gt; b`) is merged into single text nodes.
 */
const matchBrowserTree = (root: ParentNode & Node): void => {
  for (const template of Array.from(root.querySelectorAll("template"))) {
    template.remove();
  }

  for (const table of Array.from(root.querySelectorAll("table"))) {
    let tbody: HTMLElement | null = null;
    for (const child of Array.from(table.childNodes)) {
      if (child.nodeName === "TR") {
        if (!tbody) {
          tbody = table.ownerDocument.createElement("tbody");
          table.insertBefore(tbody, child);
        }
        tbody.appendChild(child);
      } else if (child.nodeType === ELEMENT_NODE) {
        tbody = null;
      } else if (tbody) {
        tbody.appendChild(child);
      }
    }
  }

  root.normalize();
};

/**
 * Parses a full HTML document with linkedom. Documents linkedom cannot place
 * into `<html><head><body>` are first normalized through parse5, a spec-compliant
 * parser, so no content is lost.
 */
export const parseDocument = (html: string): Document => {
  let document = parseHTML(html).document as unknown as Document;
  if (!hasStandardStructure(document)) {
    document = parseHTML(serialize(parse(html)))
      .document as unknown as Document;
  }
  matchBrowserTree(document);
  return document;
};

/**
 * Parses an HTML fragment and returns the element that contains it.
 * linkedom treats the first element of a bare fragment as the document root,
 * so the fragment is placed inside an empty document's body instead.
 */
export const parseFragment = (html: string): HTMLElement => {
  const { body } = parseDocument("<!doctype html><html><body></body></html>");
  body.innerHTML = html;
  matchBrowserTree(body);
  return body;
};
