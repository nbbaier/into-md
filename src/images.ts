import * as cheerio from "cheerio";

function toAbsoluteUrl(
  url: string | undefined,
  baseUrl: string
): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

export function annotateImages(html: string, baseUrl: string): string {
  const $ = cheerio.load(html);
  $("img").each((_, img) => {
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
  });

  const body = $("body");
  return body.length ? (body.html() ?? "") : ($.root().html() ?? "");
}
