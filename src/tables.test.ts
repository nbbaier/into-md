import { describe, expect, it } from "bun:test";
import { convertHtmlToMarkdown } from "./converter";
import { convertTablesToJson } from "./tables";

const TABLE_PRE = /<pre data-into-md-table="true">([\s\S]*?)<\/pre>/;

function extractTableJson(html: string) {
  const match = TABLE_PRE.exec(html);
  if (!match) {
    throw new Error("no table pre block found");
  }
  // cheerio escapes quotes inside text; decode the entities we expect.
  const decoded = (match[1] ?? "")
    .replaceAll("&quot;", '"')
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
  return JSON.parse(decoded);
}

describe("convertTablesToJson", () => {
  it("uses explicit thead headers and tbody rows", () => {
    const html =
      "<table><thead><tr><th>Name</th><th>Age</th></tr></thead>" +
      "<tbody><tr><td>Ada</td><td>36</td></tr></tbody></table>";
    const out = convertTablesToJson(html);
    const json = extractTableJson(out);
    expect(json.headers).toEqual(["Name", "Age"]);
    expect(json.rows).toEqual([{ Name: "Ada", Age: "36" }]);
  });

  it("falls back to the first row for headers when there is no thead", () => {
    const html =
      "<table><tr><th>A</th><th>B</th></tr>" +
      "<tr><td>1</td><td>2</td></tr></table>";
    const json = extractTableJson(convertTablesToJson(html));
    expect(json.headers).toEqual(["A", "B"]);
    // The header row must not leak in as a data row.
    expect(json.rows).toEqual([{ A: "1", B: "2" }]);
  });

  it("does not duplicate the header row across any table shape", () => {
    const shapes = [
      // explicit thead + tbody
      "<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>d</td></tr></tbody></table>",
      // thead, rows directly in table (no tbody)
      "<table><thead><tr><th>H</th></tr></thead><tr><td>d</td></tr></table>",
      // no thead, loose rows
      "<table><tr><th>H</th></tr><tr><td>d</td></tr></table>",
      // no thead, explicit tbody wrapping both rows
      "<table><tbody><tr><th>H</th></tr><tr><td>d</td></tr></tbody></table>",
    ];
    for (const html of shapes) {
      const json = extractTableJson(convertTablesToJson(html));
      expect(json.headers).toEqual(["H"]);
      expect(json.rows).toEqual([{ H: "d" }]);
    }
  });

  it("captures a caption when present", () => {
    const html =
      "<table><caption>People</caption><thead><tr><th>Name</th></tr></thead>" +
      "<tbody><tr><td>Ada</td></tr></tbody></table>";
    const json = extractTableJson(convertTablesToJson(html));
    expect(json.caption).toBe("People");
  });

  it("round-trips through the converter into a fenced json block", () => {
    const html =
      "<table><thead><tr><th>K</th></tr></thead>" +
      "<tbody><tr><td>v</td></tr></tbody></table>";
    const md = convertHtmlToMarkdown(convertTablesToJson(html), {
      baseUrl: "https://example.com",
    });
    expect(md).toContain("```json");
    expect(md).toContain('"headers"');
  });
});
