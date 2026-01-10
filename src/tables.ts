import * as cheerio from "cheerio";
import type { CheerioAPI, Element } from "cheerio";

type TableJson = {
  caption?: string;
  headers: string[];
  rows: Record<string, string>[];
};

function extractHeaders(
  $table: cheerio.Cheerio<Element>,
  $: CheerioAPI
): string[] {
  const explicitHeaders = $table.find("thead th");
  if (explicitHeaders.length) {
    return explicitHeaders
      .toArray()
      .map((th) => $(th).text().trim())
      .filter(Boolean);
  }

  const firstRowHeaders = $table.find("tr").first().find("th, td");
  if (firstRowHeaders.length) {
    return firstRowHeaders
      .toArray()
      .map((cell, index) => $(cell).text().trim() || `Column ${index + 1}`);
  }

  return [];
}

function extractRows(
  $table: cheerio.Cheerio<Element>,
  headers: string[],
  $: CheerioAPI
): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const dataRows =
    $table.find("tbody tr").length > 0
      ? $table.find("tbody tr")
      : $table.find("tr").slice(1);

  dataRows.each((_, row) => {
    const cells = $(row).find("td, th");
    if (!cells.length) return;
    const record: Record<string, string> = {};
    cells.each((cellIndex, cell) => {
      const key = headers[cellIndex] ?? `Column ${cellIndex + 1}`;
      record[key] = $(cell).text().trim();
    });
    rows.push(record);
  });

  return rows;
}

export function convertTablesToJson(html: string): string {
  const $ = cheerio.load(html);
  $("table").each((_, table) => {
    const $table = $(table);
    const caption = $table.find("caption").first().text().trim() || undefined;
    const headers = extractHeaders($table, $);
    const rows = extractRows($table, headers, $);

    const json: TableJson = {
      caption,
      headers,
      rows,
    };

    const pre = $("<pre>")
      .attr("data-into-md-table", "true")
      .text(JSON.stringify(json, null, 2));
    $table.replaceWith(pre);
  });

  const body = $("body");
  return body.length ? body.html() ?? "" : $.root().html() ?? "";
}
