import { parseFragment, toAbsoluteUrl } from "./utils";

/** Makes image URLs absolute and records figure captions for the converter. */
export function annotateImagesDom(root: ParentNode, baseUrl: string): void {
  for (const img of Array.from(root.querySelectorAll("img"))) {
    const absoluteSrc = toAbsoluteUrl(img.getAttribute("src"), baseUrl);
    if (absoluteSrc) {
      img.setAttribute("src", absoluteSrc);
    }

    const figure = img.closest("figure");
    const figcaption = figure
      ? Array.from(
          figure.querySelectorAll("figcaption"),
          (el) => el.textContent
        )
          .join("")
          .trim()
      : "";
    const caption =
      figcaption || img.getAttribute("title")?.trim() || undefined;
    if (caption) {
      img.setAttribute("data-into-md-caption", caption);
    }
  }
}

export function annotateImages(html: string, baseUrl: string): string {
  const root = parseFragment(html);
  annotateImagesDom(root, baseUrl);
  return root.innerHTML;
}
