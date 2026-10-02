import { parseFragment } from "./utils";

interface TableJson {
  caption?: string;
  headers: string[];
  rows: Record<string, string>[];
}

const cellText = (cell: Element): string => cell.textContent?.trim() ?? "";

/**
 * Rows that belong to this table rather than to a nested one. Rows may sit in
 * a thead/tbody/tfoot or, since linkedom adds no implicit tbody, directly in
 * the table.
 */
const ownRows = (table: Element): Element[] =>
  Array.from(table.querySelectorAll("tr")).filter(
    (row) => row.closest("table") === table
  );

const ownCells = (row: Element): Element[] =>
  Array.from(row.children).filter(
    (cell) => cell.nodeName === "TD" || cell.nodeName === "TH"
  );

const rowSection = (row: Element): string => row.parentElement?.nodeName ?? "";

function extractHeaders(rows: Element[]): string[] {
  const explicitHeaders = rows
    .filter((row) => rowSection(row) === "THEAD")
    .flatMap(ownCells)
    .filter((cell) => cell.nodeName === "TH");
  if (explicitHeaders.length) {
    return explicitHeaders.map(cellText).filter(Boolean);
  }

  const firstRowHeaders = rows[0] ? ownCells(rows[0]) : [];
  return firstRowHeaders.map(
    (cell, index) => cellText(cell) || `Column ${index + 1}`
  );
}

function extractRows(
  rows: Element[],
  headers: string[]
): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  const hasThead = rows.some(
    (row) =>
      rowSection(row) === "THEAD" &&
      ownCells(row).some((cell) => cell.nodeName === "TH")
  );
  let dataRows = rows.filter((row) => {
    const section = rowSection(row);
    return section !== "THEAD" && section !== "TFOOT";
  });
  // Without an explicit thead the first row supplied the headers, so it must
  // not be repeated as data.
  if (!hasThead) {
    dataRows = dataRows.slice(1);
  }

  for (const row of dataRows) {
    const cells = ownCells(row);
    if (!cells.length) {
      continue;
    }
    const record: Record<string, string> = {};
    for (const [cellIndex, cell] of cells.entries()) {
      const key = headers[cellIndex] ?? `Column ${cellIndex + 1}`;
      record[key] = cellText(cell);
    }
    records.push(record);
  }

  return records;
}

/** Replaces every table under `root` with a `<pre>` holding its JSON form. */
export function convertTablesToJsonDom(root: ParentNode): void {
  for (const table of Array.from(root.querySelectorAll("table"))) {
    const captionEl = table.querySelector(":scope > caption");
    const caption = (captionEl && cellText(captionEl)) || undefined;
    const tableRows = ownRows(table);
    const headers = extractHeaders(tableRows);
    const rows = extractRows(tableRows, headers);

    const json: TableJson = {
      caption,
      headers,
      rows,
    };

    const pre = table.ownerDocument.createElement("pre");
    pre.setAttribute("data-into-md-table", "true");
    pre.textContent = JSON.stringify(json, null, 2);
    table.replaceWith(pre);
  }
}

export function convertTablesToJson(html: string): string {
  const root = parseFragment(html);
  convertTablesToJsonDom(root);
  return root.innerHTML;
}
