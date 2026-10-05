import { describe, expect, it } from "bun:test";
import { annotateImagesDom } from "./images";
import { parseFragment } from "./utils";

const baseUrl = "https://example.com";

const describeImg = (html: string) => {
  const root = parseFragment(html);
  annotateImagesDom(root, baseUrl);
  return root.querySelector("img");
};

describe("annotateImagesDom", () => {
  it("rewrites relative sources to absolute", () => {
    const img = describeImg('<img src="/photo.jpg" alt="A photo">');
    expect(img?.getAttribute("src")).toBe("https://example.com/photo.jpg");
  });

  it("leaves absolute sources untouched", () => {
    const src = "https://other.example/img.png";
    const img = describeImg(`<img src="${src}">`);
    expect(img?.getAttribute("src")).toBe(src);
  });

  it("annotates a figcaption caption", () => {
    const img = describeImg(
      '<figure><img src="/p.jpg"><figcaption>Landscape</figcaption></figure>'
    );
    expect(img?.getAttribute("data-into-md-caption")).toBe("Landscape");
  });

  it("falls back to the title attribute for the caption", () => {
    const img = describeImg('<img src="/p.jpg" title="Fallback">');
    expect(img?.getAttribute("data-into-md-caption")).toBe("Fallback");
  });

  it("prefers the figcaption over the title", () => {
    const img = describeImg(
      '<figure><img src="/p.jpg" title="Title"><figcaption>Caption</figcaption></figure>'
    );
    expect(img?.getAttribute("data-into-md-caption")).toBe("Caption");
  });
});
