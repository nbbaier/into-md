import type { CheerioAPI } from "cheerio";

import { toAbsoluteUrl } from "./utils";

export function annotateImagesDom($: CheerioAPI, baseUrl: string): void {
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
}
