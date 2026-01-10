import { load } from "cheerio";

import { getBodyHtml, toAbsoluteUrl } from "./utils";

export function annotateImages(html: string, baseUrl: string): string {
  const $ = load(html);

  for (const img of $("img").toArray()) {
    const $img = $(img);
    const src = $img.attr("src");
    const absoluteSrc = toAbsoluteUrl(src, baseUrl);
    if (absoluteSrc) {
      $img.attr("src", absoluteSrc);
    }

    const figure = $img.closest("figure");
    const caption =
      figure.find("figcaption").text().trim() ||
      $img.attr("title")?.trim() ||
      undefined;
    if (caption) {
      $img.attr("data-into-md-caption", caption);
    }
  }

  return getBodyHtml($);
}
