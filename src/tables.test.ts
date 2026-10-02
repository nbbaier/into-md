import { describe, expect, it } from "bun:test";
import { convertHtmlToMarkdown } from "./converter";
import { convertTablesToJsonDom } from "./tables";
import { parseFragment } from "./utils";

const TABLE_PRE = /<pre data-into-md-table="true">([\s\S]*?)<\/pre>/;

function convertTables(html: string) {
  const root = parseFragment(html);
  convertTablesToJsonDom(root);
  return root.innerHTML;
}

function extractTableJson(html: string) {
  const match = TABLE_PRE.exec(html);
  if (!match) {
    throw new Error("no table pre block found");
  }
  // Serialized text escapes HTML entities; decode the ones we expect.
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
    const out = convertTables(html);
    const json = extractTableJson(out);
    expect(json.headers).toEqual(["Name", "Age"]);
    expect(json.rows).toEqual([{ Age: "36", Name: "Ada" }]);
  });

  it("falls back to the first row for headers when there is no thead", () => {
    const html =
      "<table><tr><th>A</th><th>B</th></tr>" +
      "<tr><td>1</td><td>2</td></tr></table>";
    const json = extractTableJson(convertTables(html));
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
      const json = extractTableJson(convertTables(html));
      expect(json.headers).toEqual(["H"]);
      expect(json.rows).toEqual([{ H: "d" }]);
    }
  });

  it("ignores rows and cells of nested tables", () => {
    const html =
      "<table><tr><th>Outer</th></tr><tr><td>" +
      "<table><tr><th>Inner</th></tr><tr><td>x</td><td>y</td></tr></table>" +
      "</td></tr></table>";
    const json = extractTableJson(convertTables(html));
    expect(json.headers).toEqual(["Outer"]);
    expect(json.rows).toHaveLength(1);
    expect(Object.keys(json.rows[0])).toEqual(["Outer"]);
  });

  it("captures a caption when present", () => {
    const html =
      "<table><caption>People</caption><thead><tr><th>Name</th></tr></thead>" +
      "<tbody><tr><td>Ada</td></tr></tbody></table>";
    const json = extractTableJson(convertTables(html));
    expect(json.caption).toBe("People");
  });

  it("round-trips through the converter into a fenced json block", () => {
    const html =
      "<table><thead><tr><th>K</th></tr></thead>" +
      "<tbody><tr><td>v</td></tr></tbody></table>";
    const md = convertHtmlToMarkdown(html, {
      baseUrl: "https://example.com",
    });
    expect(md).toContain("```json");
    expect(md).toContain('"headers"');
  });
});
