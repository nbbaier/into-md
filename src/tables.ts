import { type Cheerio, type CheerioAPI, load } from "cheerio";
import type { AnyNode } from "domhandler";

import { getBodyHtml } from "./utils";

interface TableJson {
  caption?: string;
  headers: string[];
  rows: Record<string, string>[];
}

function extractHeaders($table: Cheerio<AnyNode>, $: CheerioAPI): string[] {
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
  $table: Cheerio<AnyNode>,
  headers: string[],
  $: CheerioAPI
): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const hasThead = $table.find("thead th").length > 0;
  const bodyRows = $table.find("tbody tr");
  // Candidate data rows: prefer an explicit tbody, otherwise every row that
  // isn't inside a thead.
  let dataRows = bodyRows.length
    ? bodyRows
    : $table.find("tr").filter((_, el) => $(el).closest("thead").length === 0);
  // Without an explicit thead the first row supplied the headers, so it must
  // not be repeated as data (the HTML parser wraps loose rows in an implicit
  // tbody, which would otherwise sweep the header row back in).
  if (!hasThead) {
    dataRows = dataRows.slice(1);
  }

  for (const row of dataRows.toArray()) {
    const cells = $(row).find("td, th");
    if (!cells.length) {
      continue;
    }
    const record: Record<string, string> = {};
    for (const [cellIndex, cell] of cells.toArray().entries()) {
      const key = headers[cellIndex] ?? `Column ${cellIndex + 1}`;
      record[key] = $(cell).text().trim();
    }
    rows.push(record);
  }

  return rows;
}

export function convertTablesToJson(html: string): string {
  const $ = load(html);

  for (const table of $("table").toArray()) {
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
  }

  return getBodyHtml($);
}
