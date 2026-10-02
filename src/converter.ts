import TurndownService from "turndown";

import { annotateImagesDom } from "./images";
import { convertTablesToJsonDom } from "./tables";
import { parseFragment, toAbsoluteUrl } from "./utils";

interface ConvertOptions {
  baseUrl: string;
  stripLinks?: boolean;
}

function createTurndownService(stripLinks: boolean): TurndownService {
  const turndown = new TurndownService({
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    headingStyle: "atx",
  });

  turndown.addRule("stripLinks", {
    filter: "a",
    replacement: (content, node) => {
      if (stripLinks) {
        return content;
      }
      const href = (node as HTMLElement).getAttribute("href");
      if (!href) {
        return content;
      }
      return `[${content}](${href})`;
    },
  });

  turndown.addRule("imagesWithCaption", {
    filter: "img",
    replacement: (_, node) => {
      const element = node as HTMLElement;
      const src = element.getAttribute("src") ?? "";
      const alt = element.getAttribute("alt") ?? "";
      const caption = element.getAttribute("data-into-md-caption");
      const imageLine = `![${alt}](${src})`;
      if (caption) {
        return `${imageLine}\n*${caption}*`;
      }
      return imageLine;
    },
  });

  turndown.addRule("tableJson", {
    filter: (node) =>
      node.nodeName === "PRE" &&
      (node as HTMLElement).getAttribute("data-into-md-table") === "true",
    replacement: (_content, node) => {
      const text = (node as HTMLElement).textContent?.trim() ?? "";
      return `\`\`\`json\n${text}\n\`\`\``;
    },
  });

  turndown.addRule("embeds", {
    filter: ["iframe", "embed", "video"],
    replacement: (_, node) => {
      const src = (node as HTMLElement).getAttribute("src") ?? "";
      if (!src) {
        return "";
      }
      return `[Embedded content: ${src}]`;
    },
  });

  return turndown;
}

let turndownWithLinks: TurndownService | null = null;
let turndownWithoutLinks: TurndownService | null = null;

function getTurndownService(stripLinks?: boolean): TurndownService {
  if (stripLinks) {
    if (!turndownWithoutLinks) {
      turndownWithoutLinks = createTurndownService(true);
    }
    return turndownWithoutLinks;
  }
  if (!turndownWithLinks) {
    turndownWithLinks = createTurndownService(false);
  }
  return turndownWithLinks;
}

/**
 * Converts HTML to markdown. Accepts either an HTML string or an already
 * parsed element; an element's children are converted and the element is
 * mutated in place.
 */
export function convertHtmlToMarkdown(
  input: string | HTMLElement,
  options: ConvertOptions
): string {
  const root = typeof input === "string" ? parseFragment(input) : input;

  // 1. Convert tables to JSON pre blocks
  convertTablesToJsonDom(root);

  // 2. Annotate images with captions and absolute URLs
  annotateImagesDom(root, options.baseUrl);

  // 3. Absolutify link hrefs
  for (const el of Array.from(root.querySelectorAll("a[href]"))) {
    const absolute = toAbsoluteUrl(el.getAttribute("href"), options.baseUrl);
    if (absolute) {
      el.setAttribute("href", absolute);
    }
  }

  // 4. Remove script and style elements
  for (const el of Array.from(root.querySelectorAll("script, style"))) {
    el.remove();
  }

  const turndown = getTurndownService(options.stripLinks);
  return turndown.turndown(root);
}
