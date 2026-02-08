import { load } from "cheerio";
import TurndownService from "turndown";

import { getBodyHtml, toAbsoluteUrl } from "./utils";

interface ConvertOptions {
  baseUrl: string;
  stripLinks?: boolean;
}

function prepareDom(html: string, baseUrl: string): string {
  const $ = load(html);

  for (const el of $("a[href]").toArray()) {
    const $el = $(el);
    const absolute = toAbsoluteUrl($el.attr("href"), baseUrl);
    if (absolute) {
      $el.attr("href", absolute);
    }
  }

  for (const el of $("img[src]").toArray()) {
    const $el = $(el);
    const absolute = toAbsoluteUrl($el.attr("src"), baseUrl);
    if (absolute) {
      $el.attr("src", absolute);
    }
  }

  $("script, style").remove();
  return getBodyHtml($);
}

export function convertHtmlToMarkdown(
  html: string,
  options: ConvertOptions
): string {
  const prepared = prepareDom(html, options.baseUrl);
  const turndown = new TurndownService({
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    headingStyle: "atx",
  });

  turndown.addRule("stripLinks", {
    filter: "a",
    replacement: (content, node) => {
      if (options.stripLinks) {
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

  return turndown.turndown(prepared);
}
